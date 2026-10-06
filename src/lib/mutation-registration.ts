import {
	submitLessonFeedbackFn,
	submitStudentProgressEventFn,
} from "@/features/analytics/analytics.actions";
import {
	createClassFn,
	deleteClassFn,
	restoreClassFn,
	updateClassFn,
} from "@/features/classes/classes.actions";
import {
	createLessonFn,
	deleteLessonFn,
	restoreLessonFn,
	updateLessonFn,
} from "@/features/lessons/lessons.actions";
import type { MutationServerFnPayloadMap } from "@/lib/mutation-queue.schema";
import type { MutationServerFnName } from "@/types/sync";

type RegisterServerFn = <K extends MutationServerFnName>(
	name: K,
	fn: (
		payload: MutationServerFnPayloadMap[K],
		signal?: AbortSignal,
	) => Promise<unknown>,
) => void;

/**
 * Register all server functions that can be enqueued for background sync.
 * This should be called once at application startup.
 */
export function registerAllMutations(registerServerFn: RegisterServerFn) {
	// Lessons
	registerServerFn("createLesson", async (payload, signal) => {
		return createLessonFn({ data: payload, signal });
	});

	registerServerFn("updateLesson", async (payload, signal) => {
		return updateLessonFn({
			data: {
				id: payload.id,
				data: payload.data,
				expectedRevision: payload.expectedRevision,
				idempotencyKey: payload.idempotencyKey,
			},
			signal,
		});
	});

	registerServerFn("deleteLesson", async (payload, signal) => {
		return deleteLessonFn({
			data: {
				id: payload.id,
				expectedRevision: payload.expectedRevision,
				idempotencyKey: payload.idempotencyKey,
			},
			signal,
		});
	});

	registerServerFn("restoreLesson", async (payload, signal) => {
		return restoreLessonFn({ data: payload, signal });
	});

	// Classes
	registerServerFn("createClass", async (payload, signal) => {
		return createClassFn({ data: payload, signal });
	});

	registerServerFn("updateClass", async (payload, signal) => {
		return updateClassFn({
			data: {
				id: payload.id,
				data: payload.data,
				expectedRevision: payload.expectedRevision,
				idempotencyKey: payload.idempotencyKey,
			},
			signal,
		});
	});

	registerServerFn("deleteClass", async (payload, signal) => {
		return deleteClassFn({
			data: {
				id: payload.id,
				expectedRevision: payload.expectedRevision,
				idempotencyKey: payload.idempotencyKey,
			},
			signal,
		});
	});

	registerServerFn("restoreClass", async (payload, signal) => {
		return restoreClassFn({ data: payload, signal });
	});

	// Analytics

	registerServerFn("submitLessonFeedback", async (payload, signal) => {
		return submitLessonFeedbackFn({ data: payload, signal });
	});

	registerServerFn("submitStudentProgressEvent", async (payload, signal) => {
		return submitStudentProgressEventFn({ data: payload, signal });
	});
}
