import {
	keepPreviousData,
	mutationOptions,
	queryOptions,
} from "@tanstack/react-query";
import { uuidv7 } from "uuidv7";
import type { User } from "@/features/users/users.schema";
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
import {
	getLessonByIdFn,
	getLessonsFn,
	getPublishedLessonByIdFn,
	getPublishedLessonsFn,
} from "./lessons.actions";
import type { LessonInsert, Lesson as LessonType } from "./lessons.schema";
import type { LessonListItem } from "./lessons.service";

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

function getLocalLessonList(
	localLessons: LessonListItem[],
	params: DataTableQueryParams,
) {
	return buildLocalDataTableResult(localLessons, params, {
		globalSearchFields: ["title", "subject", "teacherNotes", "teacherName"],
	});
}

function asUserArray(value: unknown): User[] {
	if (!Array.isArray(value)) {
		return [];
	}

	return value.filter(
		(item): item is User =>
			typeof item === "object" &&
			item !== null &&
			typeof (item as { id?: unknown }).id === "string" &&
			typeof (item as { name?: unknown }).name === "string",
	);
}

function toLocalLessonListItems(
	lessons: LessonType[],
	users: User[],
): LessonListItem[] {
	const userNameById = new Map(users.map((user) => [user.id, user.name]));
	return lessons.map((lesson) => ({
		...lesson,
		teacherName: lesson.teacherId
			? (userNameById.get(lesson.teacherId) ?? null)
			: null,
	}));
}

// ----------------------------------------------------------------------

export const lessonQueries = {
	all: () => ["lessons"] as const,
	lists: () => [...lessonQueries.all(), "list"] as const,
	list: (params: DataTableQueryParams) =>
		queryOptions({
			queryKey: [...lessonQueries.lists(), params],
			queryFn: ({ signal }) =>
				readLocalFirstList({
					scope: "lessons",
					parse: asLessonArray,
					fromLocal: async (local) => {
						const { getLocalAll } = await import("@/lib/local-db");
						const users = asUserArray(await getLocalAll("users"));
						return getLocalLessonList(
							toLocalLessonListItems(local, users),
							params,
						);
					},
					fromServer: () => getLessonsFn({ data: params, signal }),
				}),
			placeholderData: keepPreviousData,
			refetchOnMount: "always",
		}),
	detail: (id: string) =>
		queryOptions({
			queryKey: [...lessonQueries.all(), id],
			queryFn: () =>
				readLocalFirstDetail({
					scope: "lessons",
					id,
					parse: asLesson,
					fromServer: () => getLessonByIdFn({ data: { id } }),
					offlineMessage: "This lesson is not available offline yet.",
				}),
		}),
	publishedList: (params: DataTableQueryParams) =>
		queryOptions({
			queryKey: [...lessonQueries.all(), "published", "list", params],
			queryFn: async ({ signal }) => {
				if (typeof window !== "undefined") {
					const { getLocalAll, initLocalDb } = await import("@/lib/local-db");
					await initLocalDb();
					const local = asLessonArray(await getLocalAll("lessons")).filter(
						(lesson) => lesson.isPublished,
					);
					if (local.length > 0 || navigator.onLine === false) {
						const users = asUserArray(await getLocalAll("users"));
						return getLocalLessonList(
							toLocalLessonListItems(local, users),
							params,
						);
					}
				}
				return getPublishedLessonsFn({ data: params, signal });
			},
			placeholderData: keepPreviousData,
		}),
	publishedDetail: (id: string) =>
		queryOptions({
			queryKey: [...lessonQueries.all(), "published", id],
			queryFn: async () => {
				if (typeof window !== "undefined") {
					const { getLocalById, initLocalDb } = await import("@/lib/local-db");
					await initLocalDb();
					const local = asLesson(await getLocalById("lessons", id));
					if (local?.isPublished) return local;
					if (navigator.onLine === false) {
						throw new Error("This lesson is not available offline yet.");
					}
				}
				return getPublishedLessonByIdFn({ data: { id } });
			},
		}),
};

export const lessonMutations = {
	create: () =>
		mutationOptions({
			mutationFn: async ({ data, id }: { data: LessonInsert; id: string }) => {
				const { initLocalDb, insertLocalAndEnqueue } = await import(
					"@/lib/local-db"
				);
				await initLocalDb();

				const now = Math.floor(Date.now() / 1000);
				const session = await getCachedAuthSession();
				const teacherId = await cacheSessionUserForLocalInsert(session);
				const completeData = {
					...data,
					id,
					teacherId,
					createdAt: now,
					updatedAt: now,
					syncStatus: "pending",
					isDeleted: 0,
				};

				await insertLocalAndEnqueue("lessons", completeData, {
					scope: "lessons",
					type: "create",
					serverFn: "createLesson",
					payload: { ...data, id, idempotencyKey: id },
					idempotencyKey: id, // Use the same ID as idempotency key
				});

				return { id };
			},
			onMutate: async ({ data: newLesson, id }) => {
				const queryClient = getQueryClient();
				await queryClient.cancelQueries({ queryKey: lessonQueries.lists() });
				const session = await getCachedAuthSession();
				const now = new Date();
				const optimisticLesson = {
					...newLesson,
					id,
					teacherId: session?.user.id ?? null,
					teacherName: session?.user.name ?? null,
					createdAt: now,
					updatedAt: now,
					lastModified: now,
					syncStatus: "pending",
					isDeleted: false,
					deletedAt: null,
				} as LessonListItem;
				const snapshots = updateListCaches<LessonListItem>(
					queryClient,
					lessonQueries.lists(),
					(items, key) => {
						const params = key.at(-1) as DataTableQueryParams | undefined;
						if (params?.pagination.pageIndex !== 0) {
							return { items, countDelta: 0 };
						}
						return { items: [optimisticLesson, ...items], countDelta: 1 };
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
				invalidates: [lessonQueries.lists()],
				successMessage: m.toast_lesson_create_success(),
				errorMessage: m.toast_lesson_create_error(),
			},
		}),
	update: (id: string) =>
		mutationOptions({
			mutationFn: async (data: LessonInsert) => {
				const { getLocalExpectedRevision, initLocalDb, updateLocalAndEnqueue } =
					await import("@/lib/local-db");
				await initLocalDb();
				const expectedRevision = await getLocalExpectedRevision("lessons", id);

				const idempotencyKey = uuidv7();
				await updateLocalAndEnqueue("lessons", id, data, {
					scope: "lessons",
					type: "update",
					serverFn: "updateLesson",
					payload: { id, data, expectedRevision, idempotencyKey },
					idempotencyKey,
				});

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
				const { deleteLocalAndEnqueue, getLocalExpectedRevision, initLocalDb } =
					await import("@/lib/local-db");
				await initLocalDb();
				const expectedRevision = await getLocalExpectedRevision("lessons", id);

				// 2. Enqueue for background sync
				const idempotencyKey = uuidv7();
				await deleteLocalAndEnqueue("lessons", id, {
					scope: "lessons",
					type: "delete",
					serverFn: "deleteLesson",
					payload: { id, expectedRevision, idempotencyKey },
					idempotencyKey,
				});

				return { id };
			},
			onMutate: async (deletedId) => {
				const queryClient = getQueryClient();
				await queryClient.cancelQueries({ queryKey: lessonQueries.lists() });
				const snapshots = updateListCaches<LessonListItem>(
					queryClient,
					lessonQueries.lists(),
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
				invalidates: [lessonQueries.lists()],
				successMessage: m.toast_lesson_delete_success(),
				errorMessage: m.toast_lesson_delete_error(),
			},
		}),
};
