import { onlineManager } from "@tanstack/react-query";
import { z } from "zod";
import { getQueryClient } from "@/lib/query-client";
import { reportSyncCompleted, reportSyncError } from "@/lib/sync-status";
import {
	SYNC_CHANGE_OPERATIONS,
	SYNC_SCOPES,
	type SyncChange,
	type SyncScope,
} from "@/types/sync";
import { getSyncCursor, pullRecords } from "./index";

const SYNC_INTERVAL_MS = 60_000;
const REQUEST_TIMEOUT_MS = 30_000;

const syncChangeSchema = z.object({
	revision: z.number().int().nonnegative(),
	scope: z.enum(SYNC_SCOPES),
	entityId: z.string().min(1),
	operation: z.enum(SYNC_CHANGE_OPERATIONS),
	data: z.record(z.string(), z.unknown()).nullable(),
});
const syncPullResponseSchema = z.object({
	changes: z.array(syncChangeSchema),
	revision: z.number().int().nonnegative(),
	hasMore: z.boolean(),
});

let timer: ReturnType<typeof setInterval> | null = null;
let unsubscribeOnline: (() => void) | null = null;
let activeSyncPromise: Promise<void> | null = null;

function isPhysicallyOnline() {
	return typeof navigator === "undefined" || navigator.onLine !== false;
}

async function fetchSyncPage(scope: SyncScope, revision: number) {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
	try {
		const params = new URLSearchParams({ revision: String(revision) });
		const response = await fetch(`/api/sync/${scope}?${params}`, {
			signal: controller.signal,
			credentials: "same-origin",
		});
		if (!response.ok) {
			const body = (await response.json().catch(() => null)) as {
				error?: unknown;
			} | null;
			const error = new Error(
				typeof body?.error === "string"
					? body.error
					: `Sync failed with HTTP ${response.status}`,
			) as Error & { status: number };
			error.status = response.status;
			throw error;
		}
		return syncPullResponseSchema.parse(await response.json());
	} finally {
		clearTimeout(timeout);
	}
}

async function pullScope(scope: SyncScope) {
	let revision = await getSyncCursor(scope);
	while (true) {
		const page = await fetchSyncPage(scope, revision);
		const changes = page.changes.filter(
			(change): change is SyncChange => change.scope === scope,
		);
		await pullRecords(scope, changes, page.revision);
		revision = page.revision;
		await getQueryClient().invalidateQueries({ queryKey: [scope] });
		if (!page.hasMore) return;
	}
}

export async function syncAll() {
	if (activeSyncPromise) return activeSyncPromise;
	if (!onlineManager.isOnline() || !isPhysicallyOnline()) return;

	activeSyncPromise = (async () => {
		const { flushMutationQueue } = await import("@/lib/mutation-queue");
		await flushMutationQueue();
		for (const scope of SYNC_SCOPES) {
			await pullScope(scope);
		}
		reportSyncCompleted(Date.now());
	})();

	try {
		await activeSyncPromise;
	} finally {
		activeSyncPromise = null;
	}
}

export async function syncAllSafely() {
	try {
		await syncAll();
	} catch (error) {
		reportSyncError(error);
		console.error("[Sync] Background synchronization failed:", error);
	}
}

export async function stopSyncCoordinator() {
	if (timer) clearInterval(timer);
	timer = null;
	unsubscribeOnline?.();
	unsubscribeOnline = null;
	await activeSyncPromise?.catch(() => undefined);
}

export async function startSyncCoordinator() {
	if (timer) return () => void stopSyncCoordinator();
	unsubscribeOnline = onlineManager.subscribe((isOnline) => {
		if (isOnline && isPhysicallyOnline()) void syncAllSafely();
	});
	if (onlineManager.isOnline() && isPhysicallyOnline()) {
		void syncAllSafely();
	}
	timer = setInterval(() => {
		if (onlineManager.isOnline() && isPhysicallyOnline()) void syncAllSafely();
	}, SYNC_INTERVAL_MS);
	return () => void stopSyncCoordinator();
}
