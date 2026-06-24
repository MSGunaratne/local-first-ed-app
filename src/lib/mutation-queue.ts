import { uuidv7 } from "uuidv7";
import { execute, query } from "@/lib/local-db/init";
import {
	type MutationScope,
	type MutationServerFnName,
	type MutationServerFnPayloadMap,
	mutationPayloadSchemas,
	type OutboxRow,
	outboxRowSchema,
	type QueuedMutation,
	queuedMutationSchema,
} from "@/types/sync";

export type {
	MutationScope,
	MutationServerFnName,
	MutationServerFnPayloadMap,
	MutationStatus,
	MutationType,
	QueuedMutation,
} from "@/types/sync";

// ----------------------------------------------------------------------
// Application-level mutation queue
// Replaces Workbox BackgroundSyncPlugin with structured SQLite outbox storage.
// Each pending mutation is stored as a discrete entry, not a serialized
// HTTP request. Mutations are replayed via server functions in FIFO order
// with per-mutation error handling and idempotency support.
// ----------------------------------------------------------------------

const MAX_RETRIES = 5;
const IN_FLIGHT_TIMEOUT_MS = 5 * 60 * 1000;
let outboxSchemaPromise: Promise<void> | null = null;

function isRecord(payload: unknown): payload is Record<string, unknown> {
	return typeof payload === "object" && payload !== null;
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
	await ensureOutboxSchema();
	const id = uuidv7();
	const entry: QueuedMutation = {
		...mutation,
		id,
		status: "pending",
		createdAt: Date.now(),
		retryCount: 0,
	};
	await insertOutboxEntry(entry);
	emitChange();
	return id;
}

export async function enqueueAndFlushIfOnline<K extends MutationServerFnName>(
	mutation: EnqueueMutation<K>,
): Promise<string> {
	const id = await enqueue(mutation);
	const { onlineManager } = await import("@tanstack/react-query");
	if (onlineManager.isOnline()) {
		void flushMutationQueue();
	}
	return id;
}

export async function getAll(): Promise<QueuedMutation[]> {
	await ensureOutboxSchema();
	await resetStaleInFlightMutations();
	const rawRows = await query<Record<string, unknown>>(
		`SELECT id, scope, mutation_type, server_fn, payload_json, idempotency_key,
            status, created_at, retry_count, last_error
     FROM _outbox
     ORDER BY created_at ASC;`,
	);
	const validMutations: QueuedMutation[] = [];

	for (const rawRow of rawRows) {
		const rowResult = outboxRowSchema.safeParse(rawRow);
		if (!rowResult.success) {
			console.warn("[MutationQueue] Dropping malformed outbox row", rawRow);
			const id = typeof rawRow.id === "string" ? rawRow.id : null;
			if (id) {
				await remove(id);
			}
			continue;
		}

		const row = rowResult.data;
		const value = outboxRowToMutation(row);
		if (value) {
			validMutations.push(value);
			continue;
		}

		console.warn(
			`[MutationQueue] Dropping malformed outbox entry "${row.id}" from SQLite`,
			row,
		);
		await remove(row.id);
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

export async function removeMutationsForEntity(
	scope: MutationScope,
	entityId: string,
): Promise<void> {
	await ensureOutboxSchema();
	const all = await getAll();
	const ids = all.flatMap((mutation) =>
		mutation.scope === scope && getMutationEntityId(mutation) === entityId
			? [mutation.id]
			: [],
	);

	if (ids.length === 0) {
		return;
	}

	const placeholders = ids.map(() => "?").join(", ");
	await execute(`DELETE FROM _outbox WHERE id IN (${placeholders});`, ids);
	emitChange();
}

export async function remove(id: string): Promise<void> {
	await ensureOutboxSchema();
	await execute("DELETE FROM _outbox WHERE id = ?;", [id]);
	emitChange();
}

async function markInFlight(id: string): Promise<void> {
	await ensureOutboxSchema();
	await execute("UPDATE _outbox SET status = 'in-flight' WHERE id = ?;", [id]);
}

async function markFailed(id: string, error: string): Promise<void> {
	await ensureOutboxSchema();
	await execute(
		`UPDATE _outbox
     SET status = 'failed',
         retry_count = retry_count + 1,
         last_error = ?
     WHERE id = ?;`,
		[error, id],
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
		const result = mutationPayloadSchemas[name].safeParse(payload);
		if (!result.success) {
			throw new Error(
				`Invalid payload for server function "${name}" during replay`,
			);
		}

		return fn(result.data as MutationServerFnPayloadMap[K]);
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
		case "submitStudentProgressEvent":
			return null;
	}
}

async function reconcileLocalStateOnSuccess(mutation: QueuedMutation) {
	if (mutation.serverFn === "submitStudentProgressEvent") {
		if (!isRecord(mutation.payload)) {
			return;
		}
		const idempotencyKey = getStringField(mutation.payload, "idempotencyKey");
		if (!idempotencyKey) {
			return;
		}
		await execute(
			"UPDATE student_progress_event SET sync_status = 'synced' WHERE idempotency_key = ?;",
			[idempotencyKey],
		);
		return;
	}

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
			if (error && typeof error === "object" && "status" in error) {
				const status = Reflect.get(error, "status");
				if (typeof status === "number" && status >= 400 && status < 500) {
					// Mark as permanently failed by maxing retries
					await execute("UPDATE _outbox SET retry_count = ? WHERE id = ?;", [
						MAX_RETRIES,
						mutation.id,
					]);
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
	await ensureOutboxSchema();
	await execute("DELETE FROM _outbox;");
	emitChange();
}

async function resetStaleInFlightMutations() {
	const cutoff = Date.now() - IN_FLIGHT_TIMEOUT_MS;
	await execute(
		`UPDATE _outbox
     SET status = 'pending',
         last_error = COALESCE(last_error, 'Reset stale in-flight mutation')
     WHERE status = 'in-flight' AND created_at < ?;`,
		[cutoff],
	);
}

async function ensureOutboxSchema() {
	outboxSchemaPromise ??= (async () => {
		await execute(`
      CREATE TABLE IF NOT EXISTS _outbox (
        id                TEXT PRIMARY KEY,
        scope             TEXT NOT NULL,
        mutation_type     TEXT NOT NULL,
        server_fn         TEXT NOT NULL,
        payload_json      TEXT NOT NULL,
        idempotency_key   TEXT NOT NULL,
        status            TEXT NOT NULL DEFAULT 'pending',
        created_at        INTEGER NOT NULL,
        retry_count       INTEGER NOT NULL DEFAULT 0,
        last_error        TEXT
      );
    `);
		await execute(
			"CREATE INDEX IF NOT EXISTS idx_outbox_status_created ON _outbox(status, created_at);",
		);
		await execute(
			"CREATE INDEX IF NOT EXISTS idx_outbox_scope_created ON _outbox(scope, created_at);",
		);
	})();

	try {
		return await outboxSchemaPromise;
	} catch (error) {
		outboxSchemaPromise = null;
		throw error;
	}
}

async function insertOutboxEntry(entry: QueuedMutation) {
	await execute(
		`INSERT INTO _outbox
      (id, scope, mutation_type, server_fn, payload_json, idempotency_key,
       status, created_at, retry_count, last_error)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
		[
			entry.id,
			entry.scope,
			entry.type,
			entry.serverFn,
			JSON.stringify(entry.payload),
			entry.idempotencyKey,
			entry.status,
			entry.createdAt,
			entry.retryCount,
			entry.lastError ?? null,
		],
	);
}

function outboxRowToMutation(row: OutboxRow): QueuedMutation | null {
	let payload: unknown;
	try {
		payload = JSON.parse(row.payload_json);
	} catch {
		return null;
	}

	const candidate = {
		id: row.id,
		scope: row.scope,
		type: row.mutation_type,
		serverFn: row.server_fn,
		payload,
		idempotencyKey: row.idempotency_key,
		status: row.status,
		createdAt: row.created_at,
		retryCount: row.retry_count,
		lastError: row.last_error ?? undefined,
	};

	const result = queuedMutationSchema.safeParse(candidate);
	return result.success ? result.data : null;
}
