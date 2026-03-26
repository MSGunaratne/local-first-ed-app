import { createStore, del, entries, set, update } from "idb-keyval";
import { uuidv7 } from "uuidv7";

// ----------------------------------------------------------------------
// Application-level mutation queue
// Replaces Workbox BackgroundSyncPlugin with structured IDB storage.
// Each pending mutation is stored as a discrete entry, not a serialized
// HTTP request. Mutations are replayed via server functions in FIFO order
// with per-mutation error handling and idempotency support.
// ----------------------------------------------------------------------

const STORE = createStore("mutation-queue", "mutations");
const MAX_RETRIES = 5;

export type MutationScope = "lessons" | "classes" | "users" | "students";
export type MutationType = "create" | "update" | "delete";
export type MutationStatus = "pending" | "in-flight" | "failed";

export interface QueuedMutation {
	id: string;
	scope: MutationScope;
	type: MutationType;
	serverFn: string;
	payload: unknown;
	idempotencyKey: string;
	status: MutationStatus;
	createdAt: number;
	retryCount: number;
	lastError?: string;
}

// ----------------------------------------------------------------------
// Queue Operations
// ----------------------------------------------------------------------

export async function enqueue(
	mutation: Omit<QueuedMutation, "id" | "status" | "createdAt" | "retryCount">,
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
	const all = await entries<string, QueuedMutation>(STORE);
	return all.map(([, v]) => v).sort((a, b) => a.createdAt - b.createdAt);
}

export async function getPending(): Promise<QueuedMutation[]> {
	const all = await getAll();
	return all.filter((m) => m.status === "pending" || m.status === "failed");
}

export async function remove(id: string): Promise<void> {
	await del(id, STORE);
	emitChange();
}

export async function markInFlight(id: string): Promise<void> {
	await update<QueuedMutation>(
		id,
		(prev) =>
			prev ? { ...prev, status: "in-flight" as const } : (undefined as never),
		STORE,
	);
}

export async function markFailed(id: string, error: string): Promise<void> {
	await update<QueuedMutation>(
		id,
		(prev) =>
			prev
				? {
						...prev,
						status: "failed" as const,
						retryCount: prev.retryCount + 1,
						lastError: error,
					}
				: (undefined as never),
		STORE,
	);
	emitChange();
}

// ----------------------------------------------------------------------
// Flush — replay all pending mutations in FIFO order
// ----------------------------------------------------------------------

/** Registry of server functions that can be invoked during flush */
const serverFnRegistry = new Map<
	string,
	(payload: unknown) => Promise<unknown>
>();

export function registerServerFn(
	name: string,
	fn: (payload: unknown) => Promise<unknown>,
) {
	serverFnRegistry.set(name, fn);
}

export interface FlushResult {
	succeeded: number;
	failed: number;
	skipped: number;
}

export async function flush(): Promise<FlushResult> {
	const pending = await getPending();
	const result: FlushResult = { succeeded: 0, failed: 0, skipped: 0 };

	for (const mutation of pending) {
		if (mutation.retryCount >= MAX_RETRIES) {
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
					await update<QueuedMutation>(
						mutation.id,
						(prev) =>
							prev
								? { ...prev, retryCount: MAX_RETRIES }
								: (undefined as never),
						STORE,
					);
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
