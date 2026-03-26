import { mutationOptions, queryOptions } from "@tanstack/react-query";
import { uuidv7 } from "uuidv7";
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
			mutationFn: (data: ClassInsert) =>
				createClassFn({ data: { ...data, idempotencyKey: uuidv7() } }),
			onMutate: async (newClass) => {
				const queryClient = (
					await import("@/lib/query-client")
				).getQueryClient();
				await queryClient.cancelQueries({ queryKey: classQueries.lists() });

				return { optimistic: true, data: newClass };
			},
			meta: {
				invalidates: [classQueries.lists()],
				successMessage: m.toast_class_create_success(),
				errorMessage: m.toast_class_create_error(),
			},
		}),
	update: () =>
		mutationOptions({
			mutationFn: async ({
				id,
				data,
			}: {
				id: string;
				data: Partial<ClassInsert>;
			}) => {
				const { getQueryClient } = await import("@/lib/query-client");
				const cached = getQueryClient().getQueryData(
					classQueries.detail(id).queryKey,
				);
				const expectedUpdatedAt =
					cached && "updatedAt" in cached
						? new Date(cached.updatedAt as Date).toISOString()
						: undefined;
				return updateClassFn({
					data: { id, data, idempotencyKey: uuidv7(), expectedUpdatedAt },
				});
			},
			onMutate: async ({ id, data: updatedData }) => {
				const queryClient = (
					await import("@/lib/query-client")
				).getQueryClient();
				const detailKey = classQueries.detail(id).queryKey;

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
				invalidates: [classQueries.lists()],
				successMessage: m.toast_class_update_success(),
				errorMessage: m.toast_class_update_error(),
			},
		}),
	delete: () =>
		mutationOptions({
			mutationFn: (id: string) =>
				deleteClassFn({ data: { id, idempotencyKey: uuidv7() } }),
			onMutate: async (deletedId) => {
				const queryClient = (
					await import("@/lib/query-client")
				).getQueryClient();
				await queryClient.cancelQueries({ queryKey: classQueries.lists() });

				return { deletedId };
			},
			meta: {
				invalidates: [classQueries.lists()],
				successMessage: m.toast_class_delete_success(),
				errorMessage: m.toast_class_delete_error(),
			},
		}),
};
