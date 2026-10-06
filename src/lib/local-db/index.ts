// Barrel export for the local-db module
export {
	closeLocalDb,
	deleteLocalDb,
	execute,
	initLocalDb,
	isReady,
	query,
	transaction,
} from "./init";

export {
	deleteLocalAndEnqueue,
	getLocalAll,
	getLocalById,
	getLocalExpectedRevision,
	getSyncCursor,
	getUnresolvedConflictCount,
	getUnresolvedConflicts,
	insertLocalAndEnqueue,
	pullRecords,
	resolveConflict,
	type SyncConflictRecord,
	type SyncDirection,
	type SyncResult,
	updateLocalAndEnqueue,
} from "./sync";

export {
	startSyncCoordinator,
	stopSyncCoordinator,
	syncAll,
	syncAllSafely,
} from "./sync-coordinator";
