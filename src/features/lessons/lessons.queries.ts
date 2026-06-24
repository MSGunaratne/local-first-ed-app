import {
	keepPreviousData,
	mutationOptions,
	queryOptions,
} from "@tanstack/react-query";
import { uuidv7 } from "uuidv7";
import type { DataTableQueryParams } from "@/lib/dataTableSearchSchema";
import { getQueryClient } from "@/lib/query-client";
import { m } from "@/paraglide/messages";
import { getLessonByIdFn, getLessonsFn } from "./lessons.actions";
import type { LessonInsert, Lesson as LessonType } from "./lessons.schema";

function asLessonArray(value: unknown): LessonType[] {
	if (!Array.isArray(value)) {
		return [];
	}

	return value.filter(
		(item): item is LessonType => typeof item === "object" && item !== null,
	);
}

function asLesson(value: unknown): LessonType | null {
	if (typeof value === "object" && value !== null) {
		return value as LessonType;
	}

	return null;
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

	if (typeof value === "boolean") {
		return value;
	}

	if (typeof value === "number") {
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

function getSortableValue(lesson: LessonType, id: string) {
	const value = lesson[id as keyof LessonType];

	if (value instanceof Date) {
		return value.getTime();
	}

	if (typeof value === "number" || typeof value === "string") {
		return value;
	}

	return "";
}

function getLocalLessonList(
	localLessons: LessonType[],
	params: DataTableQueryParams,
) {
	const globalFilter = params.globalFilter.trim().toLowerCase();

	const filtered = localLessons.filter((lesson) => {
		const matchesGlobalFilter =
			globalFilter.length === 0 ||
			[lesson.title, lesson.subject, lesson.teacherNotes]
				.filter((value): value is string => typeof value === "string")
				.some((value) => value.toLowerCase().includes(globalFilter));

		if (!matchesGlobalFilter) {
			return false;
		}

		return params.columnFilters.every((filter) =>
			localValueMatchesFilter(
				lesson[filter.id as keyof LessonType],
				filter.value,
			),
		);
	});

	const sort = params.sorting[0] ?? { id: "updatedAt", desc: true };
	const sorted = [...filtered].sort((a, b) => {
		const aValue = getSortableValue(a, sort.id);
		const bValue = getSortableValue(b, sort.id);

		if (aValue < bValue) {
			return sort.desc ? 1 : -1;
		}

		if (aValue > bValue) {
			return sort.desc ? -1 : 1;
		}

		return 0;
	});

	const pageIndex = params.pagination.pageIndex;
	const pageSize = params.pagination.pageSize;
	const total = sorted.length;
	const pageCount = Math.ceil(total / pageSize);
	const pageStart = pageIndex * pageSize;
	const data = sorted.slice(pageStart, pageStart + pageSize);

	return {
		data,
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

export const lessonQueries = {
	all: () => ["lessons"] as const,
	lists: () => [...lessonQueries.all(), "list"] as const,
	list: (params: DataTableQueryParams) =>
		queryOptions({
			queryKey: [...lessonQueries.lists(), params],
			queryFn: async ({ signal }) => {
				const { getLocalAll, isReady } = await import("@/lib/local-db");
				// Try local SQLite first (especially useful if offline)
				if (isReady()) {
					const local = asLessonArray(await getLocalAll("lessons"));
					if (local.length > 0) return getLocalLessonList(local, params);
				}
				// Fallback to server
				return getLessonsFn({ data: params, signal });
			},
			placeholderData: keepPreviousData,
		}),
	detail: (id: string) =>
		queryOptions({
			queryKey: [...lessonQueries.all(), id],
			queryFn: async () => {
				const { getLocalById, isReady } = await import("@/lib/local-db");
				if (isReady()) {
					const local = asLesson(await getLocalById("lessons", id));
					if (local) return local;
				}
				return getLessonByIdFn({ data: { id } });
			},
		}),
};

export const lessonMutations = {
	create: () =>
		mutationOptions({
			mutationFn: async (data: LessonInsert) => {
				const { insertLocal, isReady } = await import("@/lib/local-db");
				const { enqueue } = await import("@/lib/mutation-queue");
				const { flushMutationQueue } = await import("@/lib/mutation-queue");

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

				// 1. Persist to local SQLite immediately
				if (isReady()) {
					await insertLocal("lessons", completeData);
				}

				// 2. Enqueue for background sync
				await enqueue({
					scope: "lessons",
					type: "create",
					serverFn: "createLesson",
					payload: { ...data, id, idempotencyKey: id },
					idempotencyKey: id, // Use the same ID as idempotency key
				});

				// 3. Trigger background flush if online (don't await)
				const { onlineManager } = await import("@tanstack/react-query");
				if (onlineManager.isOnline()) {
					flushMutationQueue();
				}
				return { id };
			},
			onMutate: async (newLesson) => {
				const queryClient = getQueryClient();
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
				const { updateLocal, isReady } = await import("@/lib/local-db");
				const { enqueue, flushMutationQueue } = await import(
					"@/lib/mutation-queue"
				);

				// 1. Persist to local SQLite immediately
				if (isReady()) {
					await updateLocal("lessons", id, data);
				}

				// 2. Enqueue for background sync
				const cached = getQueryClient().getQueryData(
					lessonQueries.detail(id).queryKey,
				);
				const expectedUpdatedAt = getExpectedUpdatedAt(cached);

				const idempotencyKey = uuidv7();
				await enqueue({
					scope: "lessons",
					type: "update",
					serverFn: "updateLesson",
					payload: { id, data, expectedUpdatedAt, idempotencyKey },
					idempotencyKey,
				});

				// 3. Trigger background flush if online (don't await)
				const { onlineManager } = await import("@tanstack/react-query");
				if (onlineManager.isOnline()) {
					void flushMutationQueue();
				}
				return { success: true };
			},
			onMutate: async (updatedData) => {
				const queryClient = getQueryClient();
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
			mutationFn: async (id: string) => {
				const { deleteLocal, isReady } = await import("@/lib/local-db");
				const { enqueue, flushMutationQueue } = await import(
					"@/lib/mutation-queue"
				);

				// 1. Mark as deleted in local SQLite
				if (isReady()) {
					await deleteLocal("lessons", id);
				}

				// 2. Enqueue for background sync
				const idempotencyKey = uuidv7();
				await enqueue({
					scope: "lessons",
					type: "delete",
					serverFn: "deleteLesson",
					payload: { id, idempotencyKey },
					idempotencyKey,
				});

				// 3. Trigger background flush if online (don't await)
				const { onlineManager } = await import("@tanstack/react-query");
				if (onlineManager.isOnline()) {
					void flushMutationQueue();
				}
				return { id };
			},
			onMutate: async (deletedId) => {
				const queryClient = getQueryClient();
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
