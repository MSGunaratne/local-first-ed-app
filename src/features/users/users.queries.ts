import {
	keepPreviousData,
	mutationOptions,
	queryOptions,
} from "@tanstack/react-query";
import { uuidv7 } from "uuidv7";
import type { DataTableQueryParams } from "@/lib/dataTableSearchSchema";
import { m } from "@/paraglide/messages";
import {
	createUserFn,
	deleteUserFn,
	exportUsersFn,
	getUserByIdFn,
	getUsersFn,
	updateUserFn,
} from "./users.actions";
import type { UserCreateInput, UserUpdateInput } from "./users.schema";

// ----------------------------------------------------------------------

export const userQueries = {
	all: () => ["users"] as const,
	lists: () => [...userQueries.all(), "list"] as const,
	list: (params: DataTableQueryParams) =>
		queryOptions({
			queryKey: [...userQueries.lists(), params],
			queryFn: ({ signal }) => getUsersFn({ data: params, signal }),
			placeholderData: keepPreviousData,
		}),
	detail: (id: string) =>
		queryOptions({
			queryKey: [...userQueries.all(), id],
			queryFn: () => getUserByIdFn({ data: { id } }),
		}),
	exportAll: (params: Omit<DataTableQueryParams, "pagination">) =>
		exportUsersFn({
			data: {
				sorting: params.sorting,
				columnFilters: params.columnFilters,
				globalFilter: params.globalFilter,
			},
		}),
};

// Start doesn't inherently have "mutation factories" in the same way as queries because mutations are usually hooks,
// but we can define standard mutation options for consistency if desired.
export const userMutations = {
	create: () =>
		mutationOptions({
			mutationFn: (data: UserCreateInput) =>
				createUserFn({ data: { ...data, idempotencyKey: uuidv7() } }),
			onMutate: async (newUser) => {
				const queryClient = (
					await import("@/lib/query-client")
				).getQueryClient();
				await queryClient.cancelQueries({ queryKey: userQueries.lists() });

				return { optimistic: true, data: newUser };
			},
			meta: {
				invalidates: [userQueries.lists()],
				successMessage: m.toast_user_create_success(),
				errorMessage: m.toast_user_create_error(),
			},
		}),
	update: (id: string) =>
		mutationOptions({
			mutationFn: (data: UserUpdateInput) =>
				updateUserFn({ data: { id, data, idempotencyKey: uuidv7() } }),
			onMutate: async (updatedData) => {
				const queryClient = (
					await import("@/lib/query-client")
				).getQueryClient();
				const detailKey = userQueries.detail(id).queryKey;

				await queryClient.cancelQueries({ queryKey: detailKey });

				const previous = queryClient.getQueryData(detailKey);

				if (previous) {
					// Filter out File instances from the optimistic data since
					// the cache stores resolved URLs, not File objects
					const safeUpdate: Record<string, unknown> = {};
					for (const [key, value] of Object.entries(updatedData)) {
						if (!(value instanceof File)) {
							safeUpdate[key] = value;
						}
					}
					queryClient.setQueryData(detailKey, {
						...previous,
						...safeUpdate,
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
				invalidates: [userQueries.lists(), userQueries.detail(id).queryKey],
				successMessage: m.toast_user_update_success(),
				errorMessage: m.toast_user_update_error(),
			},
		}),
	delete: () =>
		mutationOptions({
			mutationFn: (id: string) =>
				deleteUserFn({ data: { id, idempotencyKey: uuidv7() } }),
			onMutate: async (deletedId) => {
				const queryClient = (
					await import("@/lib/query-client")
				).getQueryClient();
				await queryClient.cancelQueries({ queryKey: userQueries.lists() });

				return { deletedId };
			},
			meta: {
				invalidates: [userQueries.lists()],
				successMessage: m.toast_user_delete_success(),
				errorMessage: m.toast_user_update_error(),
			},
		}),
};
