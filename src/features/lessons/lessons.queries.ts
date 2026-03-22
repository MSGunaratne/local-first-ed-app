import { mutationOptions, queryOptions } from "@tanstack/react-query";
import { unwrapResult } from "@/db/utils/safe-action";
import type { DataTableQueryParams } from "@/lib/dataTableSearchSchema";
import { m } from "@/paraglide/messages";
import type { LessonInsert } from "./lessons.schema";
import {
	createLessonFn,
	deleteLessonFn,
	getLessonByIdFn,
	getLessonsFn,
	updateLessonFn,
} from "./lessons.server";

// ----------------------------------------------------------------------

export const lessonQueries = {
	all: () => ["lessons"] as const,
	lists: () => [...lessonQueries.all(), "list"] as const,
	list: (params: DataTableQueryParams) =>
		queryOptions({
			queryKey: [...lessonQueries.lists(), params],
			queryFn: () => getLessonsFn({ data: params }),
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
				unwrapResult(createLessonFn({ data })),
			meta: {
				invalidates: [lessonQueries.lists()],
				successMessage: m.toast_lesson_create_success(),
				errorMessage: m.toast_lesson_create_error(),
			},
		}),
	update: (id: string) =>
		mutationOptions({
			mutationFn: (data: LessonInsert) =>
				unwrapResult(updateLessonFn({ data: { id, data } })),
			meta: {
				invalidates: [lessonQueries.lists(), lessonQueries.detail(id).queryKey],
				successMessage: m.toast_lesson_update_success(),
				errorMessage: m.toast_lesson_update_error(),
			},
		}),
	delete: () =>
		mutationOptions({
			mutationFn: (id: string) =>
				unwrapResult(deleteLessonFn({ data: { id } })),
			meta: {
				invalidates: [lessonQueries.lists()],
				successMessage: m.toast_lesson_delete_success(),
				errorMessage: m.toast_lesson_delete_error(),
			},
		}),
};
