export const MUTATION_SCOPES = [
	"lessons",
	"classes",
	"users",
	"students",
	"analytics",
] as const;

export type MutationScope = (typeof MUTATION_SCOPES)[number];

export const SYNC_SCOPES = ["lessons", "classes", "users"] as const;

export type SyncScope = (typeof SYNC_SCOPES)[number];

export const MUTATION_TYPES = ["create", "update", "delete"] as const;

export type MutationType = (typeof MUTATION_TYPES)[number];

export const MUTATION_STATUSES = ["pending", "in-flight", "failed"] as const;

export type MutationStatus = (typeof MUTATION_STATUSES)[number];

export const MUTATION_SERVER_FNS = [
	"createLesson",
	"updateLesson",
	"deleteLesson",
	"createClass",
	"updateClass",
	"deleteClass",
	"createUser",
	"updateUser",
	"deleteUser",
	"submitLessonFeedback",
	"submitStudentProgressEvent",
] as const;

export type MutationServerFnName = (typeof MUTATION_SERVER_FNS)[number];
