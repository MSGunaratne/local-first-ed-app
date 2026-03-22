import {
	keepPreviousData,
	mutationOptions,
	queryOptions,
} from "@tanstack/react-query";
import { unwrapResult } from "@/db/utils/safe-action";
import type { DataTableQueryParams } from "@/lib/dataTableSearchSchema";
import { m } from "@/paraglide/messages";
import type { UserCreateInput, UserUpdateInput } from "./users.schema";
import {
	createUserFn,
	deleteUserFn,
	exportUsersFn,
	getUserByIdFn,
	getUsersFn,
	updateUserFn,
} from "./users.server";

// ----------------------------------------------------------------------

export const userQueries = {
	all: () => ["users"] as const,
	lists: () => [...userQueries.all(), "list"] as const,
	list: (params: DataTableQueryParams) =>
		queryOptions({
			queryKey: [...userQueries.lists(), params],
			queryFn: () => getUsersFn({ data: params }),
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
				unwrapResult(createUserFn({ data })),
			meta: {
				invalidates: [userQueries.lists()],
				successMessage: m.toast_user_create_success(),
				errorMessage: m.toast_user_create_error(),
			},
		}),
	update: (id: string) =>
		mutationOptions({
			mutationFn: (data: UserUpdateInput) =>
				unwrapResult(updateUserFn({ data: { id, data } })),
			meta: {
				invalidates: [userQueries.lists(), userQueries.detail(id).queryKey],
				successMessage: m.toast_user_update_success(),
				errorMessage: m.toast_user_update_error(),
			},
		}),
	delete: () =>
		mutationOptions({
			mutationFn: (id: string) => unwrapResult(deleteUserFn({ data: { id } })),
			meta: {
				invalidates: [userQueries.lists()],
				successMessage: m.toast_user_delete_success(),
				errorMessage: m.toast_user_delete_error(),
			},
		}),
};
