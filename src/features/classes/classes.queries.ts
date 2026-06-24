import {
	keepPreviousData,
	mutationOptions,
	queryOptions,
} from "@tanstack/react-query";
import { uuidv7 } from "uuidv7";
import type { DataTableQueryParams } from "@/lib/dataTableSearchSchema";
import { getQueryClient } from "@/lib/query-client";
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

function getExpectedUpdatedAt(value: unknown): string | undefined {
	if (typeof value !== "object" || value === null) {
		return undefined;
	}

	const maybeUpdatedAt = (value as { updatedAt?: unknown }).updatedAt;
	if (maybeUpdatedAt instanceof Date) {
		return maybeUpdatedAt.toISOString();
	}

	if (typeof maybeUpdatedAt === "string") {
		const parsed = new Date(maybeUpdatedAt);
		return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
	}

	return undefined;
}

function normalizeComparableValue(value: unknown): string | number | boolean {
	if (value instanceof Date) {
		return value.getTime();
	}
	if (typeof value === "boolean" || typeof value === "number") {
		return value;
	}
	return String(value ?? "").toLowerCase();
}

function localValueMatchesFilter(value: unknown, filterValue: unknown) {
	const localValue = normalizeComparableValue(value);
	const expectedValue = normalizeComparableValue(filterValue);

	if (typeof localValue === "boolean" || typeof expectedValue === "boolean") {
		return (
			localValue === expectedValue ||
			Number(localValue) === Number(expectedValue)
		);
	}

	return localValue === expectedValue;
}

function getSortableValue(classRecord: Class, id: string) {
	const value = classRecord[id as keyof Class];
	if (value instanceof Date) {
		return value.getTime();
	}
	if (typeof value === "number" || typeof value === "string") {
		return value;
	}
	return "";
}

function getLocalClassList(
	localClasses: Class[],
	params: DataTableQueryParams,
) {
	const globalFilter = params.globalFilter.trim().toLowerCase();

	const filtered = localClasses.filter((classRecord) => {
		const matchesGlobalFilter =
			globalFilter.length === 0 ||
			[classRecord.name, classRecord.subject]
				.filter((value): value is string => typeof value === "string")
				.some((value) => value.toLowerCase().includes(globalFilter));

		if (!matchesGlobalFilter) {
			return false;
		}

		return params.columnFilters.every((filter) =>
			localValueMatchesFilter(
				classRecord[filter.id as keyof Class],
				filter.value,
			),
		);
	});

	const sort = params.sorting[0] ?? { id: "updatedAt", desc: true };
	const sorted = [...filtered].sort((a, b) => {
		const aValue = getSortableValue(a, sort.id);
		const bValue = getSortableValue(b, sort.id);

		if (aValue < bValue) return sort.desc ? 1 : -1;
		if (aValue > bValue) return sort.desc ? -1 : 1;
		return 0;
	});

	const pageIndex = params.pagination.pageIndex;
	const pageSize = params.pagination.pageSize;
	const total = sorted.length;
	const pageCount = Math.ceil(total / pageSize);
	const pageStart = pageIndex * pageSize;

	return {
		data: sorted.slice(pageStart, pageStart + pageSize),
		meta: {
			itemCount: total,
			total,
			page: pageIndex,
			limit: pageSize,
			pageCount,
			hasPreviousPage: pageIndex > 0,
			hasNextPage: pageIndex < pageCount - 1,
		},
	};
}

// ----------------------------------------------------------------------

export const classQueries = {
	all: () => ["classes"] as const,
	lists: () => [...classQueries.all(), "list"] as const,
	list: (params: DataTableQueryParams) =>
		queryOptions({
			queryKey: [...classQueries.lists(), params],
			queryFn: async () => {
				const { getLocalAll, isReady } = await import("@/lib/local-db");
				if (isReady()) {
					const local = asClassArray(await getLocalAll("classes"));
					if (local.length > 0) return getLocalClassList(local, params);
				}
				return getClassesFn({ data: params });
			},
			placeholderData: keepPreviousData,
		}),
	detail: (id: string) =>
		queryOptions({
			queryKey: [...classQueries.all(), id],
			queryFn: async () => {
				const { getLocalById, isReady } = await import("@/lib/local-db");
				if (isReady()) {
					const local = asClass(await getLocalById("classes", id));
					if (local) return local;
				}
				return getClassByIdFn({ data: { id } });
			},
		}),
};

export const classMutations = {
	create: () =>
		mutationOptions({
			mutationFn: async (data: ClassInsert) => {
				const { insertLocal, isReady } = await import("@/lib/local-db");
				const { enqueue, flushMutationQueue } = await import(
					"@/lib/mutation-queue"
				);

				const id = uuidv7();
				const now = Math.floor(Date.now() / 1000);
				const completeData = {
					...data,
					id,
					createdAt: now,
					updatedAt: now,
					syncStatus: "pending",
					isDeleted: 0,
				};

				if (isReady()) {
					await insertLocal("classes", completeData);
				}

				await enqueue({
					scope: "classes",
					type: "create",
					serverFn: "createClass",
					payload: { ...data, id, idempotencyKey: id },
					idempotencyKey: id,
				});

				const { onlineManager } = await import("@tanstack/react-query");
				if (onlineManager.isOnline()) {
					void flushMutationQueue();
				}

				return { id };
			},
			onMutate: async (newClass) => {
				const queryClient = getQueryClient();
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
				const { updateLocal, isReady } = await import("@/lib/local-db");
				const { enqueue, flushMutationQueue } = await import(
					"@/lib/mutation-queue"
				);

				const cached = getQueryClient().getQueryData(
					classQueries.detail(id).queryKey,
				);
				const expectedUpdatedAt = getExpectedUpdatedAt(cached);

				if (isReady()) {
					await updateLocal("classes", id, { ...data });
				}

				const idempotencyKey = uuidv7();
				await enqueue({
					scope: "classes",
					type: "update",
					serverFn: "updateClass",
					payload: { id, data, idempotencyKey, expectedUpdatedAt },
					idempotencyKey,
				});

				const { onlineManager } = await import("@tanstack/react-query");
				if (onlineManager.isOnline()) {
					void flushMutationQueue();
				}

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
				invalidates: [classQueries.lists()],
				successMessage: m.toast_class_update_success(),
				errorMessage: m.toast_class_update_error(),
			},
		}),
	delete: () =>
		mutationOptions({
			mutationFn: async (id: string) => {
				const { deleteLocal, isReady } = await import("@/lib/local-db");
				const { enqueue, flushMutationQueue } = await import(
					"@/lib/mutation-queue"
				);

				if (isReady()) {
					await deleteLocal("classes", id);
				}

				const idempotencyKey = uuidv7();
				await enqueue({
					scope: "classes",
					type: "delete",
					serverFn: "deleteClass",
					payload: { id, idempotencyKey },
					idempotencyKey,
				});

				const { onlineManager } = await import("@tanstack/react-query");
				if (onlineManager.isOnline()) {
					void flushMutationQueue();
				}

				return { id };
			},
			onMutate: async (deletedId) => {
				const queryClient = getQueryClient();
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
