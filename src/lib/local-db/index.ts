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
	deleteLocal,
	getLocalAll,
	getLocalById,
	getLocalExpectedUpdatedAt,
	getPendingDeleteRecords,
	getPendingPushRecords,
	getSyncCursor,
	getUnresolvedConflictCount,
	getUnresolvedConflicts,
	insertLocal,
	markSynced,
	pullRecords,
	purgeSynced,
	resolveConflict,
	type SyncConflictRecord,
	type SyncDirection,
	type SyncResult,
	type SyncScope,
	updateLocal,
} from "./sync";

export {
	startSyncCoordinator,
	stopSyncCoordinator,
	syncAll,
} from "./sync-coordinator";
