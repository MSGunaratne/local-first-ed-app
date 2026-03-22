import { mutationOptions, queryOptions } from "@tanstack/react-query";
import { unwrapResult } from "@/db/utils/safe-action";
import type { DataTableQueryParams } from "@/lib/dataTableSearchSchema";
import type { ClassInsert } from "./classes.schema";
import {
	createClassFn,
	deleteClassFn,
	getClassByIdFn,
	getClassesFn,
	updateClassFn,
} from "./classes.server";

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
			mutationFn: (data: ClassInsert) => unwrapResult(createClassFn({ data })),
			meta: {
				invalidates: [classQueries.lists()],
				successMessage: "Class created successfully",
				errorMessage: "Failed to create class",
			},
		}),
	update: () =>
		mutationOptions({
			mutationFn: ({ id, data }: { id: string; data: Partial<ClassInsert> }) =>
				unwrapResult(updateClassFn({ data: { id, data } })),
			meta: {
				invalidates: [classQueries.lists()],
				successMessage: "Class updated successfully",
				errorMessage: "Failed to update class",
			},
		}),
	delete: () =>
		mutationOptions({
			mutationFn: (id: string) => unwrapResult(deleteClassFn({ data: { id } })),
			meta: {
				invalidates: [classQueries.lists()],
				successMessage: "Class deleted successfully",
				errorMessage: "Failed to delete class",
			},
		}),
};
