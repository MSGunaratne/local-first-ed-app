import {
	keepPreviousData,
	mutationOptions,
	queryOptions,
} from "@tanstack/react-query";
import { uuidv7 } from "uuidv7";
import type { DataTableQueryParams } from "@/lib/dataTableSearchSchema";
import { m } from "@/paraglide/messages";
import {
	createLessonFn,
	deleteLessonFn,
	getLessonByIdFn,
	getLessonsFn,
	updateLessonFn,
} from "./lessons.actions";
import type { LessonInsert } from "./lessons.schema";

// ----------------------------------------------------------------------

export const lessonQueries = {
	all: () => ["lessons"] as const,
	lists: () => [...lessonQueries.all(), "list"] as const,
	list: (params: DataTableQueryParams) =>
		queryOptions({
			queryKey: [...lessonQueries.lists(), params],
			queryFn: ({ signal }) => getLessonsFn({ data: params, signal }),
			placeholderData: keepPreviousData,
		}),
	detail: (id: string) =>
		queryOptions({
			queryKey: [...lessonQueries.all(), id],
			queryFn: () => getLessonByIdFn({ data: { id } }),
		}),
};

export const lessonMutations = {
	create: () =>
		mutationOptions({
			mutationFn: (data: LessonInsert) =>
				createLessonFn({ data: { ...data, idempotencyKey: uuidv7() } }),
			onMutate: async (newLesson) => {
				const queryClient = (
					await import("@/lib/query-client")
				).getQueryClient();
				await queryClient.cancelQueries({ queryKey: lessonQueries.lists() });

				return { optimistic: true, data: newLesson };
			},
			meta: {
				invalidates: [lessonQueries.lists()],
				successMessage: m.toast_lesson_create_success(),
				errorMessage: m.toast_lesson_create_error(),
			},
		}),
	update: (id: string) =>
		mutationOptions({
			mutationFn: async (data: LessonInsert) => {
				const { getQueryClient } = await import("@/lib/query-client");
				const cached = getQueryClient().getQueryData(
					lessonQueries.detail(id).queryKey,
				);
				const expectedUpdatedAt =
					cached && "updatedAt" in cached
						? new Date(cached.updatedAt as Date).toISOString()
						: undefined;
				return updateLessonFn({
					data: { id, data, idempotencyKey: uuidv7(), expectedUpdatedAt },
				});
			},
			onMutate: async (updatedData) => {
				const queryClient = (
					await import("@/lib/query-client")
				).getQueryClient();
				const detailKey = lessonQueries.detail(id).queryKey;

				await queryClient.cancelQueries({ queryKey: detailKey });

				const previous = queryClient.getQueryData(detailKey);

				if (previous) {
					queryClient.setQueryData(detailKey, {
						...previous,
						...updatedData,
						updatedAt: new Date(),
					});
				}

				return { previous, detailKey };
			},
			onError: (_error, _variables, context) => {
				if (context?.previous && context?.detailKey) {
					const { getQueryClient } =
						require("@/lib/query-client") as typeof import("@/lib/query-client");
					getQueryClient().setQueryData(context.detailKey, context.previous);
				}
			},
			meta: {
				invalidates: [lessonQueries.lists(), lessonQueries.detail(id).queryKey],
				successMessage: m.toast_lesson_update_success(),
				errorMessage: m.toast_lesson_update_error(),
			},
		}),
	delete: () =>
		mutationOptions({
			mutationFn: (id: string) =>
				deleteLessonFn({ data: { id, idempotencyKey: uuidv7() } }),
			onMutate: async (deletedId) => {
				const queryClient = (
					await import("@/lib/query-client")
				).getQueryClient();
				await queryClient.cancelQueries({ queryKey: lessonQueries.lists() });

				return { deletedId };
			},
			meta: {
				invalidates: [lessonQueries.lists()],
				successMessage: m.toast_lesson_delete_success(),
				errorMessage: m.toast_lesson_delete_error(),
			},
		}),
};
