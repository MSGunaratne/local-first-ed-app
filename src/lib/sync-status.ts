import { environmentManager, onlineManager } from "@tanstack/react-query";
import { useEffect, useSyncExternalStore } from "react";
import { fData } from "#/utils/format-number";
import { getQueryClient, getStorageEstimate } from "@/lib/query-client";

// ----------------------------------------------------------------------
// Sync Status Store – tracks pending mutations, last sync, and storage
// ----------------------------------------------------------------------

interface SyncState {
	pendingMutationCount: number /** Number of mutations currently pending in TanStack Query */;
	queuedMutationCount: number;
	failedMutationCount: number;
	corruptMutationCount: number;
	reauthenticationRequiredCount: number;
	conflictCount: number;
	lastSyncAt: number | null;
	isOnline: boolean;
	storageUsageBytes: number;
	storageQuotaBytes: number;
	localDatabaseStatus: "idle" | "initializing" | "ready" | "error";
	localDatabaseError: string | null;
	syncError: string | null;
}

interface HotModuleApi {
	dispose(callback: () => void): void;
}

let currentState: SyncState = {
	pendingMutationCount: 0,
	queuedMutationCount: 0,
	failedMutationCount: 0,
	corruptMutationCount: 0,
	reauthenticationRequiredCount: 0,
	conflictCount: 0,
	lastSyncAt: null,
	isOnline: true,
	storageUsageBytes: 0,
	storageQuotaBytes: 0,
	localDatabaseStatus: "idle",
	localDatabaseError: null,
	syncError: null,
};

const listeners = new Set<() => void>();

function emitChange() {
	// Defer notification to avoid updates during another component's render.
	queueMicrotask(() => {
		for (const listener of listeners) {
			listener();
		}
	});
}

function updateState(partial: Partial<SyncState>) {
	currentState = { ...currentState, ...partial };
	emitChange();
}

function subscribe(listener: () => void) {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

function getSnapshot(): SyncState {
	return currentState;
}

/** Cached server snapshot — must return the same reference every call */
const SERVER_SNAPSHOT: SyncState = {
	pendingMutationCount: 0,
	queuedMutationCount: 0,
	failedMutationCount: 0,
	corruptMutationCount: 0,
	reauthenticationRequiredCount: 0,
	conflictCount: 0,
	lastSyncAt: null,
	isOnline: true,
	storageUsageBytes: 0,
	storageQuotaBytes: 0,
	localDatabaseStatus: "idle",
	localDatabaseError: null,
	syncError: null,
};

function getServerSnapshot(): SyncState {
	return SERVER_SNAPSHOT;
}

// ----------------------------------------------------------------------
// Initialization – wire up to QueryClient and OnlineManager
// ----------------------------------------------------------------------

let initialized = false;
let storageRefreshIntervalId: ReturnType<typeof setInterval> | null = null;

function initializeSyncStatus() {
	if (initialized || environmentManager.isServer()) {
		return;
	}
	initialized = true;

	// Set initial online state without emitting (avoids setState during render)
	currentState = { ...currentState, isOnline: onlineManager.isOnline() };
	onlineManager.subscribe((isOnline) => {
		updateState({ isOnline });
		if (isOnline) {
			// Auto-flush mutation queue on reconnect
			void flushMutationQueue();
		}
	});

	// Track pending mutations (TanStack Query in-flight)
	const queryClient = getQueryClient();
	const mutationCache = queryClient.getMutationCache();

	mutationCache.subscribe(() => {
		const allMutations = mutationCache.getAll();
		const pending = allMutations.filter(
			(m) => m.state.status === "pending",
		).length;

		updateState({ pendingMutationCount: pending });
	});

	// Track queued mutations (offline queue)
	void import("@/lib/mutation-queue").then((mutationQueue) => {
		mutationQueue.subscribe(() => {
			void refreshQueuedCount();
		});
	});
	void refreshQueuedCount();
	void refreshConflictCount();

	// Periodically update storage usage (every 30 seconds)
	if (storageRefreshIntervalId !== null) {
		clearInterval(storageRefreshIntervalId);
	}

	void refreshStorageUsage();
	storageRefreshIntervalId = setInterval(() => {
		void refreshStorageUsage();
		void refreshConflictCount();
	}, 30_000);
}

const hotModule = (import.meta as { hot?: HotModuleApi }).hot;
if (hotModule) {
	hotModule.dispose(() => {
		if (storageRefreshIntervalId !== null) {
			clearInterval(storageRefreshIntervalId);
			storageRefreshIntervalId = null;
		}
		initialized = false;
	});
}

async function refreshStorageUsage() {
	try {
		const { usageBytes, quotaBytes } = await getStorageEstimate();
		updateState({
			storageUsageBytes: usageBytes,
			storageQuotaBytes: quotaBytes,
		});
	} catch {
		// Silently ignore
	}
}

async function refreshQueuedCount() {
	try {
		const mutationQueue = await import("@/lib/mutation-queue");
		const all = await mutationQueue.getAll();
		const pending = all.filter(
			(m) => m.status === "pending" || m.status === "inFlight",
		);
		const corruptCount = await mutationQueue.getCorruptCount();
		const blocked = all.filter((m) => m.status === "blocked");
		const reauthenticationRequired = all.filter(
			(m) => m.status === "blocked" && m.errorKind === "authentication",
		);

		updateState({
			queuedMutationCount: pending.length,
			failedMutationCount: blocked.length + corruptCount,
			corruptMutationCount: corruptCount,
			reauthenticationRequiredCount: reauthenticationRequired.length,
		});
	} catch {
		// Silently ignore
	}
}

async function refreshConflictCount() {
	try {
		const { getUnresolvedConflictCount } = await import("@/lib/local-db");
		const localCount = await getUnresolvedConflictCount();
		const { getAll } = await import("@/lib/mutation-queue");
		const queueCount = (await getAll()).filter(
			(mutation) => mutation.status === "conflict",
		).length;
		updateState({ conflictCount: localCount + queueCount });
	} catch {
		updateState({ conflictCount: 0 });
	}
}

async function flushMutationQueue() {
	try {
		const mutationQueue = await import("@/lib/mutation-queue");
		const result = await mutationQueue.flushMutationQueue();
		if (result.succeeded > 0) {
			// Notify SW to broadcast invalidation to all tabs
			navigator.serviceWorker?.controller?.postMessage({
				type: "MUTATIONS_FLUSHED",
			});
		}
	} catch (error) {
		console.error("[SyncStatus] Failed to flush mutation queue:", error);
	}
}

export function reportSyncCompleted(timestamp: number) {
	updateState({ lastSyncAt: timestamp, syncError: null });
}

export function reportSyncError(error: unknown) {
	updateState({
		syncError:
			error instanceof Error ? error.message : "Synchronization failed",
	});
}

export function reportLocalDatabaseStatus(
	status: SyncState["localDatabaseStatus"],
	error: string | null = null,
) {
	updateState({ localDatabaseStatus: status, localDatabaseError: error });
}

// ----------------------------------------------------------------------
// React Hook
// ----------------------------------------------------------------------

export function useSyncStatus() {
	// Initialize outside the render pass to avoid triggering state updates
	// during another component's render
	useEffect(() => {
		initializeSyncStatus();
	}, []);

	const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

	return {
		...state,
		/** Human-readable storage usage */
		storageUsageFormatted: fData(state.storageUsageBytes),
		/** Whether there are active pending mutations (in-flight or queued) */
		hasPendingMutations:
			state.pendingMutationCount > 0 || state.queuedMutationCount > 0,
		/** Whether there are failed mutations that need attention */
		hasFailedMutations: state.failedMutationCount > 0,
		hasConflicts: state.conflictCount > 0,
		/** Total active pending: in-flight + queued (excluding failed) */
		totalPending: state.pendingMutationCount + state.queuedMutationCount,
		/** Total failed mutations */
		totalFailed: state.failedMutationCount,
		totalConflicts: state.conflictCount,
		/** Human-readable last sync time */
		lastSyncFormatted: state.lastSyncAt
			? formatRelativeTime(state.lastSyncAt)
			: null,
	};
}

// ----------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------

function formatRelativeTime(timestamp: number): string {
	const diffMs = Date.now() - timestamp;
	const diffSec = Math.floor(diffMs / 1000);

	if (diffSec < 10) return "just now";
	if (diffSec < 60) return `${diffSec}s ago`;

	const diffMin = Math.floor(diffSec / 60);
	if (diffMin < 60) return `${diffMin}m ago`;

	const diffHr = Math.floor(diffMin / 60);
	if (diffHr < 24) return `${diffHr}h ago`;

	return `${Math.floor(diffHr / 24)}d ago`;
}
