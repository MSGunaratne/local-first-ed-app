import {
	keepPreviousData,
	mutationOptions,
	queryOptions,
} from "@tanstack/react-query";
import { uuidv7 } from "uuidv7";
import type { DataTableQueryParams } from "@/lib/dataTableSearchSchema";
import { buildLocalDataTableResult } from "@/lib/local-data-table";
import {
	readLocalFirstDetail,
	readLocalFirstList,
	restoreQuerySnapshots,
	updateListCaches,
} from "@/lib/local-first-query";
import { cacheSessionUserForLocalInsert } from "@/lib/local-session-user";
import { getCachedAuthSession, getQueryClient } from "@/lib/query-client";
import { m } from "@/paraglide/messages";
import { getClassByIdFn, getClassesFn } from "./classes.actions";
import type { Class, ClassInsert } from "./classes.schema";

function asClassArray(value: unknown): Class[] {
	if (!Array.isArray(value)) {
		return [];
	}

	return value.filter(
		(item): item is Class => typeof item === "object" && item !== null,
	);
}

function asClass(value: unknown): Class | null {
	return typeof value === "object" && value !== null ? (value as Class) : null;
}

function getLocalClassList(
	localClasses: Class[],
	params: DataTableQueryParams,
) {
	return buildLocalDataTableResult(localClasses, params, {
		globalSearchFields: ["name", "subject"],
	});
}

// ----------------------------------------------------------------------

export const classQueries = {
	all: () => ["classes"] as const,
	lists: () => [...classQueries.all(), "list"] as const,
	list: (params: DataTableQueryParams) =>
		queryOptions({
			queryKey: [...classQueries.lists(), params],
			queryFn: ({ signal }) =>
				readLocalFirstList({
					scope: "classes",
					parse: asClassArray,
					fromLocal: (local) => getLocalClassList(local, params),
					fromServer: () => getClassesFn({ data: params, signal }),
				}),
			placeholderData: keepPreviousData,
			refetchOnMount: "always",
		}),
	detail: (id: string) =>
		queryOptions({
			queryKey: [...classQueries.all(), id],
			queryFn: () =>
				readLocalFirstDetail({
					scope: "classes",
					id,
					parse: asClass,
					fromServer: () => getClassByIdFn({ data: { id } }),
					offlineMessage: "This class is not available offline yet.",
				}),
		}),
};

export const classMutations = {
	create: () =>
		mutationOptions({
			mutationFn: async ({ data, id }: { data: ClassInsert; id: string }) => {
				const { initLocalDb, insertLocalAndEnqueue } = await import(
					"@/lib/local-db"
				);
				await initLocalDb();

				const now = Math.floor(Date.now() / 1000);
				const session = await getCachedAuthSession();
				const completeData = {
					...data,
					id,
					teacherId: data.teacherId ?? session?.user.id,
					createdAt: now,
					updatedAt: now,
					syncStatus: "pending",
					isDeleted: 0,
				};

				if (completeData.teacherId) {
					await cacheSessionUserForLocalInsert(session);
				}

				await insertLocalAndEnqueue("classes", completeData, {
					scope: "classes",
					type: "create",
					serverFn: "createClass",
					payload: { ...data, id, idempotencyKey: id },
					idempotencyKey: id,
				});

				return { id };
			},
			onMutate: async ({ data: newClass, id }) => {
				const queryClient = getQueryClient();
				await queryClient.cancelQueries({ queryKey: classQueries.lists() });
				const session = await getCachedAuthSession();
				const now = new Date();
				const optimisticClass = {
					...newClass,
					id,
					teacherId: session?.user.id ?? "",
					createdAt: now,
					updatedAt: now,
					deletedAt: null,
				} as Class;
				const snapshots = updateListCaches<Class>(
					queryClient,
					classQueries.lists(),
					(items, key) => {
						const params = key.at(-1) as DataTableQueryParams | undefined;
						if (params?.pagination.pageIndex !== 0) {
							return { items, countDelta: 0 };
						}
						return { items: [optimisticClass, ...items], countDelta: 1 };
					},
				);
				return { snapshots };
			},
			onError: (_error, _variables, context) => {
				if (context?.snapshots) {
					restoreQuerySnapshots(getQueryClient(), context.snapshots);
				}
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
				const { getLocalExpectedRevision, initLocalDb, updateLocalAndEnqueue } =
					await import("@/lib/local-db");
				await initLocalDb();
				const expectedRevision = await getLocalExpectedRevision("classes", id);

				const idempotencyKey = uuidv7();
				await updateLocalAndEnqueue("classes", id, data, {
					scope: "classes",
					type: "update",
					serverFn: "updateClass",
					payload: { id, data, idempotencyKey, expectedRevision },
					idempotencyKey,
				});

				return { success: true };
			},
			onMutate: async ({ id, data: updatedData }) => {
				const queryClient = getQueryClient();
				const detailKey = classQueries.detail(id).queryKey;

				await queryClient.cancelQueries({ queryKey: detailKey });

				const previous = queryClient.getQueryData(detailKey);

				if (previous) {
					queryClient.setQueryData(detailKey, {
						...previous,
						...updatedData,
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
				invalidates: [classQueries.lists()],
				successMessage: m.toast_class_update_success(),
				errorMessage: m.toast_class_update_error(),
			},
		}),
	delete: () =>
		mutationOptions({
			mutationFn: async (id: string) => {
				const { deleteLocalAndEnqueue, getLocalExpectedRevision, initLocalDb } =
					await import("@/lib/local-db");
				await initLocalDb();
				const expectedRevision = await getLocalExpectedRevision("classes", id);

				const idempotencyKey = uuidv7();
				await deleteLocalAndEnqueue("classes", id, {
					scope: "classes",
					type: "delete",
					serverFn: "deleteClass",
					payload: { id, expectedRevision, idempotencyKey },
					idempotencyKey,
				});

				return { id };
			},
			onMutate: async (deletedId) => {
				const queryClient = getQueryClient();
				await queryClient.cancelQueries({ queryKey: classQueries.lists() });
				const snapshots = updateListCaches<Class>(
					queryClient,
					classQueries.lists(),
					(items) => ({
						items: items.filter((item) => item.id !== deletedId),
						countDelta: items.some((item) => item.id === deletedId) ? -1 : 0,
					}),
				);
				return { snapshots };
			},
			onError: (_error, _variables, context) => {
				if (context?.snapshots) {
					restoreQuerySnapshots(getQueryClient(), context.snapshots);
				}
			},
			meta: {
				invalidates: [classQueries.lists()],
				successMessage: m.toast_class_delete_success(),
				errorMessage: m.toast_class_delete_error(),
			},
		}),
};
