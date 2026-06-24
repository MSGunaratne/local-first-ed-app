import {
	submitLessonFeedbackFn,
	submitStudentProgressEventFn,
} from "@/features/analytics/analytics.actions";
import {
	createClassFn,
	deleteClassFn,
	updateClassFn,
} from "@/features/classes/classes.actions";
import {
	createLessonFn,
	deleteLessonFn,
	updateLessonFn,
} from "@/features/lessons/lessons.actions";
import {
	createUserFn,
	deleteUserFn,
	updateUserFn,
} from "@/features/users/users.actions";
import { registerServerFn } from "./mutation-queue";

/**
 * Register all server functions that can be enqueued for background sync.
 * This should be called once at application startup.
 */
export function registerAllMutations() {
	// Lessons
	registerServerFn("createLesson", async (payload) => {
		return createLessonFn({ data: payload });
	});

	registerServerFn("updateLesson", async (payload) => {
		return updateLessonFn({
			data: {
				id: payload.id,
				data: payload.data,
				expectedUpdatedAt: payload.expectedUpdatedAt,
				idempotencyKey: payload.idempotencyKey,
			},
		});
	});

	registerServerFn("deleteLesson", async (payload) => {
		return deleteLessonFn({
			data: { id: payload.id, idempotencyKey: payload.idempotencyKey },
		});
	});

	// Classes
	registerServerFn("createClass", async (payload) => {
		return createClassFn({ data: payload });
	});

	registerServerFn("updateClass", async (payload) => {
		return updateClassFn({
			data: {
				id: payload.id,
				data: payload.data,
				expectedUpdatedAt: payload.expectedUpdatedAt,
				idempotencyKey: payload.idempotencyKey,
			},
		});
	});

	registerServerFn("deleteClass", async (payload) => {
		return deleteClassFn({
			data: { id: payload.id, idempotencyKey: payload.idempotencyKey },
		});
	});

	// Users
	registerServerFn("createUser", async (payload) => {
		return createUserFn({ data: payload });
	});

	registerServerFn("updateUser", async (payload) => {
		return updateUserFn({
			data: {
				id: payload.id,
				data: payload.data,
				idempotencyKey: payload.idempotencyKey,
			},
		});
	});

	registerServerFn("deleteUser", async (payload) => {
		return deleteUserFn({
			data: { id: payload.id, idempotencyKey: payload.idempotencyKey },
		});
	});

	// Analytics

	registerServerFn("submitLessonFeedback", async (payload) => {
		return submitLessonFeedbackFn({ data: payload });
	});

	registerServerFn("submitStudentProgressEvent", async (payload) => {
		return submitStudentProgressEventFn({ data: payload });
	});
}
