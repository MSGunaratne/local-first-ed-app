import { mutationOptions, queryOptions } from "@tanstack/react-query";
import type { DataTableQueryParams } from "@/lib/dataTableSearchSchema";
import { m } from "@/paraglide/messages";
import {
	createClassFn,
	deleteClassFn,
	getClassByIdFn,
	getClassesFn,
	updateClassFn,
} from "./classes.actions";
import type { ClassInsert } from "./classes.schema";

// ----------------------------------------------------------------------

export const classQueries = {
	all: () => ["classes"] as const,
	lists: () => [...classQueries.all(), "list"] as const,
	list: (params: DataTableQueryParams) =>
		queryOptions({
			queryKey: [...classQueries.lists(), params],
			queryFn: () => getClassesFn({ data: params }),
		}),
	detail: (id: string) =>
		queryOptions({
			queryKey: [...classQueries.all(), id],
			queryFn: () => getClassByIdFn({ data: { id } }),
		}),
};

export const classMutations = {
	create: () =>
		mutationOptions({
			mutationFn: (data: ClassInsert) => createClassFn({ data }),
			meta: {
				invalidates: [classQueries.lists()],
				successMessage: m.toast_class_create_success(),
				errorMessage: m.toast_class_create_error(),
			},
		}),
	update: () =>
		mutationOptions({
			mutationFn: ({ id, data }: { id: string; data: Partial<ClassInsert> }) =>
				updateClassFn({ data: { id, data } }),
			meta: {
				invalidates: [classQueries.lists()],
				successMessage: m.toast_class_update_success(),
				errorMessage: m.toast_class_update_error(),
			},
		}),
	delete: () =>
		mutationOptions({
			mutationFn: (id: string) => deleteClassFn({ data: { id } }),
			meta: {
				invalidates: [classQueries.lists()],
				successMessage: m.toast_class_delete_success(),
				errorMessage: m.toast_class_delete_error(),
			},
		}),
};
