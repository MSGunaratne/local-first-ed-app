import {
	keepPreviousData,
	mutationOptions,
	onlineManager,
	queryOptions,
} from "@tanstack/react-query";
import { uuidv7 } from "uuidv7";
import type { DataTableQueryParams } from "@/lib/dataTableSearchSchema";
import { getQueryClient } from "@/lib/query-client";
import { m } from "@/paraglide/messages";
import {
	createUserFn,
	deleteUserFn,
	exportUsersFn,
	getUserByIdFn,
	getUsersFn,
	updateUserFn,
} from "./users.actions";
import type { UserCreateInput, UserUpdateInput } from "./users.validation";

// ----------------------------------------------------------------------

function requirePhysicalConnection() {
	if (!onlineManager.isOnline() || navigator.onLine === false) {
		throw new Error("User account changes require an internet connection.");
	}
}

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
			mutationFn: async (data: UserCreateInput) => {
				requirePhysicalConnection();
				const idempotencyKey = uuidv7();
				return createUserFn({ data: { ...data, idempotencyKey } });
			},
			onMutate: async (newUser) => {
				const queryClient = getQueryClient();
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
			mutationFn: async (data: UserUpdateInput) => {
				requirePhysicalConnection();
				const idempotencyKey = uuidv7();
				return updateUserFn({
					data: { id, data: { ...data, idempotencyKey }, idempotencyKey },
				});
			},
			onMutate: async (updatedData) => {
				const queryClient = getQueryClient();
				const detailKey = userQueries.detail(id).queryKey;

				await queryClient.cancelQueries({ queryKey: detailKey });

				const previous = queryClient.getQueryData(detailKey);

				if (previous) {
					// Filter out File instances from the optimistic data since
					// the cache stores resolved URLs, not File objects
					const safeUpdate = Object.fromEntries(
						Object.entries(updatedData).filter(
							([_, value]) => !(value instanceof File),
						),
					);
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
			mutationFn: async (id: string) => {
				requirePhysicalConnection();
				const idempotencyKey = uuidv7();
				await deleteUserFn({ data: { id, idempotencyKey } });
				return { id };
			},
			onMutate: async (deletedId) => {
				const queryClient = getQueryClient();
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
