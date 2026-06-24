// ----------------------------------------------------------------------
// Sync Coordinator: Orchestrates background sync between Local SQLite and D1
// ----------------------------------------------------------------------

import { onlineManager } from "@tanstack/react-query";
import { uuidv7 } from "uuidv7";
import { z } from "zod";
import { getClassByIdFn } from "@/features/classes/classes.actions";
import { getLessonByIdFn } from "@/features/lessons/lessons.actions";
import type { MutationServerFnName } from "@/types/sync";
import { SYNC_SCOPES, type SyncScope } from "@/types/sync";
import {
	getPendingDeleteRecords,
	getPendingPushRecords,
	getSyncCursor,
	pullRecords,
} from "./index";

const SYNC_INTERVAL = 60000; // 60 seconds
const syncPullResponseSchema = z.object({
	data: z.array(z.unknown()),
	cursor: z.unknown().optional(),
	hasMore: z.boolean().optional(),
});

let syncTimer: ReturnType<typeof setInterval> | null = null;
let onlineUnsubscribe: (() => void) | null = null;
let isSyncing = false;
let activeSyncPromise: Promise<void> | null = null;

function getCreateServerFn(scope: SyncScope) {
	if (scope === "users") {
		throw new Error(
			"Users scope does not support create push via sync coordinator",
		);
	}
	return scope === "lessons" ? "createLesson" : "createClass";
}

function getUpdateServerFn(scope: SyncScope) {
	if (scope === "users") {
		throw new Error(
			"Users scope does not support update push via sync coordinator",
		);
	}
	return scope === "lessons" ? "updateLesson" : "updateClass";
}

function getDeleteServerFn(scope: SyncScope) {
	if (scope === "users") {
		throw new Error(
			"Users scope does not support delete push via sync coordinator",
		);
	}
	return scope === "lessons" ? "deleteLesson" : "deleteClass";
}

async function resolveRecordOperation(scope: SyncScope, id: string) {
	if (scope === "lessons") {
		try {
			await getLessonByIdFn({ data: { id } });
			return "update" as const;
		} catch {
			return "create" as const;
		}
	}

	if (scope === "classes") {
		try {
			await getClassByIdFn({ data: { id } });
			return "update" as const;
		} catch {
			return "create" as const;
		}
	}

	return "update" as const;
}

function getExpectedUpdatedAtFromRecord(record: Record<string, unknown>) {
	const value = record.baseUpdatedAt ?? record.updatedAt;
	if (value instanceof Date) {
		return value.toISOString();
	}

	if (typeof value === "number") {
		const millis = value < 100000000000 ? value * 1000 : value;
		const date = new Date(millis);
		return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
	}

	if (typeof value === "string") {
		if (/^\d+$/.test(value)) {
			return getExpectedUpdatedAtFromRecord({
				updatedAt: Number.parseInt(value, 10),
			});
		}
		const date = new Date(value);
		return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
	}

	return undefined;
}

/**
 * Stop the background sync coordinator and wait for any active sync to complete.
 */
export async function stopSyncCoordinator() {
	if (syncTimer) {
		clearInterval(syncTimer);
		syncTimer = null;
	}
	if (onlineUnsubscribe) {
		onlineUnsubscribe();
		onlineUnsubscribe = null;
	}
	if (activeSyncPromise) {
		console.info(
			"[Sync] Waiting for active sync to complete before stopping...",
		);
		try {
			await activeSyncPromise;
		} catch (err) {
			console.error("[Sync] Error waiting for active sync to settle:", err);
		}
	}
	isSyncing = false;
	console.info("[Sync] Coordinator stopped.");
}

/**
 * Start the background sync coordinator.
 * Returns a cleanup function.
 */
export async function startSyncCoordinator() {
	if (syncTimer) {
		// Already running, but return a dummy cleanup or the current one
		return stopSyncCoordinator;
	}

	// 1. Listen for online status changes
	onlineUnsubscribe = onlineManager.subscribe(async (isOnline) => {
		if (isOnline) {
			console.info("[Sync] Back online, triggering immediate sync...");
			await syncAll();
		}
	});

	// 2. Initial sync
	if (onlineManager.isOnline()) {
		await syncAll();
	}

	// 3. Periodic sync
	syncTimer = setInterval(async () => {
		if (onlineManager.isOnline()) {
			await syncAll();
		}
	}, SYNC_INTERVAL);

	// Return cleanup function
	return stopSyncCoordinator;
}

/**
 * Trigger a full sync across all scopes.
 */
export async function syncAll(): Promise<void> {
	if (isSyncing) {
		console.debug("[Sync] Already syncing, skipping...");
		return activeSyncPromise || Promise.resolve();
	}
	isSyncing = true;
	console.info("[Sync] --- Starting Full Sync ---");

	// Set a safety timeout to reset isSyncing if something hangs
	const timeoutId = setTimeout(() => {
		if (isSyncing) {
			console.warn(
				"[Sync] Sync timed out after 60s. Forcefully resetting flag.",
			);
			isSyncing = false;
		}
	}, 60000);

	activeSyncPromise = (async () => {
		try {
			// 1. Flush the mutation queue first (high priority changes)
			console.info("[Sync] Flushing mutation queue...");
			const { flushMutationQueue } = await import("@/lib/mutation-queue");
			const flushRes = await flushMutationQueue();
			console.info(
				`[Sync] Queue flush: ${flushRes.succeeded} succeeded, ${flushRes.failed} failed.`,
			);

			// 2. Perform push/pull for each scope
			for (const scope of SYNC_SCOPES) {
				console.info(`[Sync] Synchronizing scope: ${scope}...`);
				await syncScope(scope);
			}
			console.info("[Sync] --- Full Sync Finished ---");
		} catch (error) {
			console.error("[Sync] Full sync failed fatally:", error);
		} finally {
			clearTimeout(timeoutId);
			isSyncing = false;
			activeSyncPromise = null;
		}
	})();

	return activeSyncPromise;
}

/**
 * Synchronize a specific scope (lessons, classes, users).
 */
async function syncScope(scope: SyncScope) {
	try {
		// A. Push local changes
		await pushScope(scope);

		// B. Pull server changes
		await pullScope(scope);
	} catch (error) {
		console.error(`[Sync] Scope "${scope}" failed:`, error);
	}
}

/**
 * Push pending local changes to the server.
 */
async function pushScope(scope: SyncScope) {
	if (scope === "users") {
		return;
	}

	const { enqueue, flushMutationQueue, hasExistingMutation } = await import(
		"@/lib/mutation-queue"
	);

	// Push modifications
	console.info(`[Sync:${scope}] Checking for pending modifications to push...`);
	const pendingPush = await getPendingPushRecords(scope);
	if (pendingPush.length > 0) {
		console.info(
			`[Sync:${scope}] Pushing ${pendingPush.length} pending records...`,
		);

		for (const record of pendingPush) {
			const id = record.id;
			if (typeof id !== "string" || id.length === 0) {
				continue;
			}

			const idempotencyKey = uuidv7();

			// Check if already in queue to avoid duplicates
			if (await hasExistingMutation(scope, id)) {
				console.debug(
					`[Sync:${scope}] Skipping record ${id}, already in mutation queue.`,
				);
				continue;
			}

			const operation = await resolveRecordOperation(scope, id);

			if (operation === "create") {
				const serverFn: MutationServerFnName = getCreateServerFn(scope);
				await enqueue({
					scope,
					type: "create",
					serverFn,
					payload: { ...record, id, idempotencyKey },
					idempotencyKey,
				});
				continue;
			}

			const serverFn: MutationServerFnName = getUpdateServerFn(scope);
			await enqueue({
				scope,
				type: "update",
				serverFn,
				payload: {
					id,
					data: record,
					expectedUpdatedAt: getExpectedUpdatedAtFromRecord(record),
					idempotencyKey,
				},
				idempotencyKey,
			});
		}
	}

	// Push deletions
	console.info(`[Sync:${scope}] Checking for pending deletes to push...`);
	const pendingDeletes = await getPendingDeleteRecords(scope);
	if (pendingDeletes.length > 0) {
		console.info(`[Sync:${scope}] Pushing ${pendingDeletes.length} deletes...`);
		for (const id of pendingDeletes) {
			// Check if already in queue to avoid duplicates
			if (await hasExistingMutation(scope, id)) {
				console.debug(
					`[Sync:${scope}] Skipping delete for ${id}, already in mutation queue.`,
				);
				continue;
			}

			const idempotencyKey = uuidv7();
			const serverFn: MutationServerFnName = getDeleteServerFn(scope);
			await enqueue({
				scope,
				type: "delete",
				serverFn,
				payload: { id, idempotencyKey },
				idempotencyKey,
			});
		}
	}

	if (pendingPush.length > 0 || pendingDeletes.length > 0) {
		const result = await flushMutationQueue();
		console.info(
			`[Sync:${scope}] Push flush: ${result.succeeded} succeeded, ${result.failed} failed, ${result.skipped} skipped.`,
		);
	}
}

/**
 * Pull new/updated records from the server since the last sync.
 */
async function pullScope(scope: SyncScope) {
	console.info(`[Sync:${scope}] Pulling records from server...`);
	const cursor = await getSyncCursor(scope);

	try {
		const params = new URLSearchParams();
		if (cursor) {
			params.set("cursor", cursor);
			params.set("since", cursor);
		}
		const query = params.toString();
		const response = await fetch(
			`/api/sync/${scope}${query ? `?${query}` : ""}`,
		);
		if (!response.ok) {
			const errJson = await response.json().catch(() => ({ error: "Unknown" }));
			console.error(
				`[Sync:${scope}] Server Pull Error (HTTP ${response.status}):`,
				errJson,
			);
			return;
		}

		const resJson = syncPullResponseSchema.parse(await response.json());
		const records = resJson.data.filter(
			(item): item is Record<string, unknown> =>
				typeof item === "object" && item !== null,
		);
		const nextCursor =
			typeof resJson.cursor === "string"
				? resJson.cursor
				: resJson.cursor
					? JSON.stringify(resJson.cursor)
					: null;

		if (records.length > 0) {
			console.info(
				`[Sync:${scope}] Received ${records.length} new records from server.`,
			);
			await pullRecords(scope, records, nextCursor);
			if (resJson.hasMore) {
				await pullScope(scope);
			}
		} else {
			console.info(`[Sync:${scope}] No new records to pull.`);
		}
	} catch (error) {
		console.error(`[Sync:${scope}] Network error during pull:`, error);
	}
}
