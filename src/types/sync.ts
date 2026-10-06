export const MUTATION_SCOPES = [
	"lessons",
	"classes",
	"users",
	"students",
	"analytics",
] as const;

export type MutationScope = (typeof MUTATION_SCOPES)[number];

export const SYNC_SCOPES = ["users", "classes", "lessons"] as const;

export type SyncScope = (typeof SYNC_SCOPES)[number];

export const MUTATION_TYPES = ["create", "update", "delete"] as const;

export type MutationType = (typeof MUTATION_TYPES)[number];

export const MUTATION_STATUSES = [
	"pending",
	"inFlight",
	"blocked",
	"conflict",
	"corrupt",
] as const;

export type MutationStatus = (typeof MUTATION_STATUSES)[number];

export const MUTATION_ERROR_KINDS = [
	"network",
	"server",
	"authentication",
	"authorization",
	"validation",
	"conflict",
	"unknown",
] as const;

export type MutationErrorKind = (typeof MUTATION_ERROR_KINDS)[number];

export const SYNC_CHANGE_OPERATIONS = ["upsert", "delete"] as const;

export type SyncChangeOperation = (typeof SYNC_CHANGE_OPERATIONS)[number];

export interface SyncChange {
	revision: number;
	scope: SyncScope;
	entityId: string;
	operation: SyncChangeOperation;
	data: Record<string, unknown> | null;
}

export interface SyncPullResponse {
	changes: SyncChange[];
	revision: number;
	hasMore: boolean;
}

export const MUTATION_SERVER_FNS = [
	"createLesson",
	"updateLesson",
	"deleteLesson",
	"restoreLesson",
	"createClass",
	"updateClass",
	"deleteClass",
	"restoreClass",
	"createUser",
	"updateUser",
	"deleteUser",
	"submitLessonFeedback",
	"submitStudentProgressEvent",
] as const;

export type MutationServerFnName = (typeof MUTATION_SERVER_FNS)[number];
