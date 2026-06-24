import { environmentManager, onlineManager } from "@tanstack/react-query";
import { useEffect, useSyncExternalStore } from "react";
import { fData } from "#/utils/format-number";
import * as mutationQueue from "@/lib/mutation-queue";
import { getQueryClient, getStorageEstimate } from "@/lib/query-client";

// ----------------------------------------------------------------------
// Sync Status Store – tracks pending mutations, last sync, and storage
// ----------------------------------------------------------------------

interface SyncState {
	pendingMutationCount: number /** Number of mutations currently pending in TanStack Query */;
	queuedMutationCount: number;
	failedMutationCount: number;
	conflictCount: number;
	lastSyncAt: number | null;
	isOnline: boolean;
	storageUsageBytes: number;
	storageQuotaBytes: number;
}

interface HotModuleApi {
	dispose(callback: () => void): void;
}

let currentState: SyncState = {
	pendingMutationCount: 0,
	queuedMutationCount: 0,
	failedMutationCount: 0,
	conflictCount: 0,
	lastSyncAt: null,
	isOnline: true,
	storageUsageBytes: 0,
	storageQuotaBytes: 0,
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
	conflictCount: 0,
	lastSyncAt: null,
	isOnline: true,
	storageUsageBytes: 0,
	storageQuotaBytes: 0,
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
			updateState({ lastSyncAt: Date.now() });
			// Auto-flush mutation queue on reconnect
			void flushMutationQueue();
		}
	});

	// Track pending mutations (TanStack Query in-flight)
	const queryClient = getQueryClient();
	const mutationCache = queryClient.getMutationCache();

	mutationCache.subscribe((event) => {
		const allMutations = mutationCache.getAll();
		const pending = allMutations.filter(
			(m) => m.state.status === "pending",
		).length;

		updateState({ pendingMutationCount: pending });

		// Update last sync time when a mutation succeeds while online
		if (
			event.type === "updated" &&
			event.mutation.state.status === "success" &&
			onlineManager.isOnline()
		) {
			updateState({ lastSyncAt: Date.now() });
		}
	});

	// Track queued mutations (offline queue)
	mutationQueue.subscribe(() => {
		void refreshQueuedCount();
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
		const all = await mutationQueue.getAll();
		const pending = all.filter(
			(m) => m.status === "pending" || m.status === "in-flight",
		);
		const failed = all.filter((m) => m.status === "failed");

		updateState({
			queuedMutationCount: pending.length,
			failedMutationCount: failed.length,
		});
	} catch {
		// Silently ignore
	}
}

async function refreshConflictCount() {
	try {
		const { getUnresolvedConflictCount } = await import("@/lib/local-db");
		const count = await getUnresolvedConflictCount();
		updateState({ conflictCount: count });
	} catch {
		updateState({ conflictCount: 0 });
	}
}

async function flushMutationQueue() {
	try {
		const { flushMutationQueue } = await import("@/lib/mutation-queue");
		const result = await flushMutationQueue();
		if (result.succeeded > 0) {
			updateState({ lastSyncAt: Date.now() });
		}
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
