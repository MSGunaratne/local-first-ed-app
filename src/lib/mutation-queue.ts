import { clear, createStore, del, entries, get, set } from "idb-keyval";
import { uuidv7 } from "uuidv7";
import { LessonFeedbackInput } from "#/features/analytics/analytics.schema";

// ----------------------------------------------------------------------
// Application-level mutation queue
// Replaces Workbox BackgroundSyncPlugin with structured IDB storage.
// Each pending mutation is stored as a discrete entry, not a serialized
// HTTP request. Mutations are replayed via server functions in FIFO order
// with per-mutation error handling and idempotency support.
// ----------------------------------------------------------------------

const STORE = createStore("mutation-queue", "mutations");
const MAX_RETRIES = 5;

export type MutationScope =
	| "lessons"
	| "classes"
	| "users"
	| "students"
	| "analytics";
export type MutationType = "create" | "update" | "delete";
export type MutationStatus = "pending" | "in-flight" | "failed";

type MutationDataRecord = Record<string, unknown>;

type ScopedCreatePayload = MutationDataRecord & {
	id: string;
	idempotencyKey?: string;
};

type ScopedUpdatePayload = {
	id: string;
	data: MutationDataRecord;
	expectedUpdatedAt?: string;
	idempotencyKey?: string;
};

type ScopedDeletePayload = {
	id: string;
	idempotencyKey?: string;
};

export interface MutationServerFnPayloadMap {
	createLesson: ScopedCreatePayload;
	updateLesson: ScopedUpdatePayload;
	deleteLesson: ScopedDeletePayload;
	createClass: ScopedCreatePayload;
	updateClass: ScopedUpdatePayload;
	deleteClass: ScopedDeletePayload;
	createUser: MutationDataRecord;
	updateUser: {
		id: string;
		data: MutationDataRecord;
		idempotencyKey?: string;
	};
	deleteUser: ScopedDeletePayload;
	submitLessonFeedback: LessonFeedbackInput;
}

export type MutationServerFnName = keyof MutationServerFnPayloadMap;

function isRecord(payload: unknown): payload is Record<string, unknown> {
	return typeof payload === "object" && payload !== null;
}

function hasStringId(
	payload: unknown,
): payload is Record<string, unknown> & { id: string } {
	return (
		isRecord(payload) && typeof payload.id === "string" && payload.id.length > 0
	);
}

function isScopedUpdatePayload(
	payload: unknown,
): payload is ScopedUpdatePayload {
	if (!isRecord(payload)) {
		return false;
	}

	if (!hasStringId(payload) || !isRecord(payload.data)) {
		return false;
	}

	if (
		"expectedUpdatedAt" in payload &&
		typeof payload.expectedUpdatedAt !== "undefined" &&
		typeof payload.expectedUpdatedAt !== "string"
	) {
		return false;
	}

	if (
		"idempotencyKey" in payload &&
		typeof payload.idempotencyKey !== "undefined" &&
		typeof payload.idempotencyKey !== "string"
	) {
		return false;
	}

	return true;
}

function isScopedDeletePayload(
	payload: unknown,
): payload is ScopedDeletePayload {
	if (!hasStringId(payload)) {
		return false;
	}

	if (
		"idempotencyKey" in payload &&
		typeof payload.idempotencyKey !== "undefined" &&
		typeof payload.idempotencyKey !== "string"
	) {
		return false;
	}

	return true;
}

function isScopedCreatePayload(
	payload: unknown,
): payload is ScopedCreatePayload {
	if (!hasStringId(payload)) {
		return false;
	}

	if (
		"idempotencyKey" in payload &&
		typeof payload.idempotencyKey !== "undefined" &&
		typeof payload.idempotencyKey !== "string"
	) {
		return false;
	}

	return true;
}

function isUserUpdatePayload(
	payload: unknown,
): payload is MutationServerFnPayloadMap["updateUser"] {
	if (!isRecord(payload)) {
		return false;
	}

	if (!hasStringId(payload) || !isRecord(payload.data)) {
		return false;
	}

	if (
		"idempotencyKey" in payload &&
		typeof payload.idempotencyKey !== "undefined" &&
		typeof payload.idempotencyKey !== "string"
	) {
		return false;
	}

	return true;
}

function isValidPayloadForServerFn<K extends MutationServerFnName>(
	name: K,
	payload: unknown,
): payload is MutationServerFnPayloadMap[K] {
	if (name === "submitLessonFeedback") {
		if (!isRecord(payload)) {
			return false;
		}

		return (
			typeof payload.idempotencyKey === "string" &&
			typeof payload.lessonId === "string" &&
			typeof payload.pseudonymousActorId === "string" &&
			typeof payload.rating === "number"
		);
	}

	switch (name) {
		case "createLesson":
		case "createClass":
			return isScopedCreatePayload(payload);
		case "updateLesson":
		case "updateClass":
			return isScopedUpdatePayload(payload);
		case "deleteLesson":
		case "deleteClass":
		case "deleteUser":
			return isScopedDeletePayload(payload);
		case "createUser":
			return isRecord(payload);
		case "updateUser":
			return isUserUpdatePayload(payload);
		default:
			return false;
	}
}

export interface QueuedMutation {
	id: string;
	scope: MutationScope;
	type: MutationType;
	serverFn: MutationServerFnName;
	payload: unknown;
	idempotencyKey: string;
	status: MutationStatus;
	createdAt: number;
	retryCount: number;
	lastError?: string;
}

function isQueuedMutation(value: unknown): value is QueuedMutation {
	if (!isRecord(value)) {
		return false;
	}

	return (
		typeof value.id === "string" &&
		typeof value.scope === "string" &&
		typeof value.type === "string" &&
		typeof value.serverFn === "string" &&
		typeof value.idempotencyKey === "string" &&
		typeof value.status === "string" &&
		typeof value.createdAt === "number" &&
		typeof value.retryCount === "number"
	);
}

export type EnqueueMutation<K extends MutationServerFnName> = Omit<
	QueuedMutation,
	"id" | "status" | "createdAt" | "retryCount" | "serverFn" | "payload"
> & {
	serverFn: K;
	payload: MutationServerFnPayloadMap[K];
};

// ----------------------------------------------------------------------
// Queue Operations
// ----------------------------------------------------------------------

export async function enqueue<K extends MutationServerFnName>(
	mutation: EnqueueMutation<K>,
): Promise<string> {
	const id = uuidv7();
	const entry: QueuedMutation = {
		...mutation,
		id,
		status: "pending",
		createdAt: Date.now(),
		retryCount: 0,
	};
	await set(id, entry, STORE);
	emitChange();
	return id;
}

export async function getAll(): Promise<QueuedMutation[]> {
	const all = await entries<string, unknown>(STORE);
	const validMutations: QueuedMutation[] = [];

	for (const [key, value] of all) {
		if (isQueuedMutation(value)) {
			validMutations.push(value);
			continue;
		}

		console.warn(
			`[MutationQueue] Dropping malformed queue entry "${key}" from IndexedDB`,
			value,
		);
		await del(key, STORE);
	}

	return validMutations.sort((a, b) => a.createdAt - b.createdAt);
}

export async function getPending(): Promise<QueuedMutation[]> {
	const all = await getAll();
	return all.filter(
		(mutation) => mutation.status === "pending" || mutation.status === "failed",
	);
}

/**
 * Checks if there is an existing pending or in-flight mutation for a specific entity.
 */
export async function hasExistingMutation(
	scope: MutationScope,
	entityId: string,
): Promise<boolean> {
	const all = await getAll();
	return all.some((m) => {
		const mEntityId = getMutationEntityId(m);
		return (
			m.scope === scope &&
			mEntityId === entityId &&
			(m.status === "pending" ||
				m.status === "in-flight" ||
				m.status === "failed")
		);
	});
}

export async function remove(id: string): Promise<void> {
	await del(id, STORE);
	emitChange();
}

async function markInFlight(id: string): Promise<void> {
	const current = await get<QueuedMutation>(id, STORE);
	if (!current) {
		return;
	}

	await set(
		id,
		{
			...current,
			status: "in-flight" as const,
		},
		STORE,
	);
}

async function markFailed(id: string, error: string): Promise<void> {
	const current = await get<QueuedMutation>(id, STORE);
	if (!current) {
		return;
	}

	await set(
		id,
		{
			...current,
			status: "failed" as const,
			retryCount: current.retryCount + 1,
			lastError: error,
		},
		STORE,
	);
	emitChange();
}

// ----------------------------------------------------------------------
// Flush Logic
// ----------------------------------------------------------------------

/** Registry of server functions that can be invoked during flush */
const serverFnRegistry = new Map<
	MutationServerFnName,
	(payload: unknown) => Promise<unknown>
>();
let flushInFlight: Promise<FlushResult> | null = null;

let registryBootstrapped = false;

async function ensureServerFnRegistry() {
	if (registryBootstrapped || serverFnRegistry.size > 0) {
		registryBootstrapped = true;
		return;
	}

	try {
		const { registerAllMutations } = await import(
			"@/lib/mutation-registration"
		);
		registerAllMutations();
		registryBootstrapped = true;
	} catch (error) {
		console.error(
			"[MutationQueue] Failed to initialize server function registry",
			error,
		);
	}
}

export function registerServerFn<K extends MutationServerFnName>(
	name: K,
	fn: (payload: MutationServerFnPayloadMap[K]) => Promise<unknown>,
) {
	serverFnRegistry.set(name, async (payload) => {
		if (!isValidPayloadForServerFn(name, payload)) {
			throw new Error(
				`Invalid payload for server function "${name}" during replay`,
			);
		}

		return fn(payload);
	});
}

export interface FlushResult {
	succeeded: number;
	failed: number;
	skipped: number;
}

function getStringField(
	record: Record<string, unknown>,
	field: string,
): string | null {
	const value = record[field];
	return typeof value === "string" && value.length > 0 ? value : null;
}

function getMutationEntityId(mutation: QueuedMutation): string | null {
	if (!isRecord(mutation.payload)) {
		return null;
	}

	switch (mutation.serverFn) {
		case "createLesson":
		case "updateLesson":
		case "deleteLesson":
		case "createClass":
		case "updateClass":
		case "deleteClass":
		case "updateUser":
		case "deleteUser":
			return getStringField(mutation.payload, "id");
		case "createUser":
		case "submitLessonFeedback":
			return null;
	}
}

async function reconcileLocalStateOnSuccess(mutation: QueuedMutation) {
	if (mutation.scope !== "lessons" && mutation.scope !== "classes") {
		return;
	}

	const id = getMutationEntityId(mutation);
	if (!id) {
		return;
	}

	const { markSynced, purgeSynced } = await import("@/lib/local-db");
	if (mutation.type === "delete") {
		await purgeSynced(mutation.scope, [id]);
		return;
	}

	await markSynced(mutation.scope, [id]);
}

/**
 * Replays all pending mutations in the queue.
 */
export async function flushMutationQueue(): Promise<FlushResult> {
	if (flushInFlight) {
		return flushInFlight;
	}

	flushInFlight = flushMutationQueueInternal();

	try {
		return await flushInFlight;
	} finally {
		flushInFlight = null;
	}
}

async function flushMutationQueueInternal(): Promise<FlushResult> {
	await ensureServerFnRegistry();

	const pending = await getPending();
	const result: FlushResult = { succeeded: 0, failed: 0, skipped: 0 };

	for (const mutation of pending) {
		if (mutation.retryCount >= MAX_RETRIES) {
			await remove(mutation.id);
			result.skipped++;
			continue;
		}

		const fn = serverFnRegistry.get(mutation.serverFn);
		if (!fn) {
			console.error(
				`[MutationQueue] No server function registered for "${mutation.serverFn}"`,
			);
			await markFailed(
				mutation.id,
				`Unknown server function: ${mutation.serverFn}`,
			);
			result.failed++;
			continue;
		}

		try {
			await markInFlight(mutation.id);
			await fn(mutation.payload);
			await reconcileLocalStateOnSuccess(mutation).catch((error) => {
				console.error(
					`[MutationQueue] Failed to reconcile local state for ${mutation.scope}:${mutation.type}`,
					error,
				);
			});
			await remove(mutation.id);
			result.succeeded++;
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			await markFailed(mutation.id, message);
			result.failed++;

			// If it's a 4xx error (client error), don't retry — it won't succeed
			if (
				error &&
				typeof error === "object" &&
				"status" in error &&
				typeof (error as { status: number }).status === "number"
			) {
				const status = (error as { status: number }).status;
				if (status >= 400 && status < 500) {
					// Mark as permanently failed by maxing retries
					const current = await get<QueuedMutation>(mutation.id, STORE);
					if (current) {
						await set(
							mutation.id,
							{ ...current, retryCount: MAX_RETRIES },
							STORE,
						);
					}
				}
			}
		}
	}

	emitChange();
	return result;
}

// ----------------------------------------------------------------------
// Change notification for reactive UI
// ----------------------------------------------------------------------

const changeListeners = new Set<() => void>();

function emitChange() {
	for (const listener of changeListeners) {
		listener();
	}
}

export function subscribe(listener: () => void): () => void {
	changeListeners.add(listener);
	return () => {
		changeListeners.delete(listener);
	};
}

export async function clearMutationQueue(): Promise<void> {
	await clear(STORE);
	emitChange();
}
