export const MUTATION_SCOPES = [
	"lessons",
	"classes",
	"users",
	"students",
	"analytics",
] as const;

export const SYNC_SCOPES = ["lessons", "classes", "users"] as const;

export const MUTATION_TYPES = ["create", "update", "delete"] as const;

export const MUTATION_STATUSES = ["pending", "in-flight", "failed"] as const;

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
