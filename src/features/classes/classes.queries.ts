import {
	keepPreviousData,
	mutationOptions,
	queryOptions,
} from "@tanstack/react-query";
import { uuidv7 } from "uuidv7";
import { z } from "zod";
import type { Session } from "@/lib/auth-client";
import type { DataTableQueryParams } from "@/lib/dataTableSearchSchema";
import { buildLocalDataTableResult } from "@/lib/local-data-table";
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

function getLocalClassList(
	localClasses: Class[],
	params: DataTableQueryParams,
) {
	return buildLocalDataTableResult(localClasses, params, {
		globalSearchFields: ["name", "subject"],
	});
}

const cachedSessionUserSchema = z.object({
	id: z.string().min(1),
	name: z.string().min(1),
	email: z.string().min(1),
	role: z.string().min(1),
	emailVerified: z.boolean().optional(),
	email_verified: z.boolean().optional(),
	image: z.string().nullable().optional(),
	phoneNumber: z.string().nullable().optional(),
	banned: z.boolean().optional(),
	banReason: z.string().nullable().optional(),
	banExpires: z.unknown().optional(),
});

async function cacheSessionUserForLocalClassInsert(session: Session | null) {
	const result = cachedSessionUserSchema.safeParse(session?.user);
	if (!result.success) {
		return;
	}

	const user = result.data;
	const emailVerified =
		user.emailVerified === true || user.email_verified === true;
	const banExpiresDate = user.banExpires
		? new Date(String(user.banExpires))
		: null;

	const { execute } = await import("@/lib/local-db");
	const now = Math.floor(Date.now() / 1000);
	await execute(
		`INSERT OR IGNORE INTO user
      (id, name, email, email_verified, image, phone_number, created_at, updated_at, role, banned, ban_reason, ban_expires)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
		[
			user.id,
			user.name,
			user.email,
			emailVerified ? 1 : 0,
			user.image ?? null,
			user.phoneNumber ?? null,
			now,
			now,
			user.role,
			user.banned ? 1 : 0,
			user.banReason ?? null,
			banExpiresDate && !Number.isNaN(banExpiresDate.getTime())
				? Math.floor(banExpiresDate.getTime() / 1000)
				: null,
		],
	);
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
				const { enqueueAndFlushIfOnline } = await import(
					"@/lib/mutation-queue"
				);

				const id = uuidv7();
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

				if (isReady() && completeData.teacherId) {
					await cacheSessionUserForLocalClassInsert(session);
					await insertLocal("classes", completeData);
				}

				await enqueueAndFlushIfOnline({
					scope: "classes",
					type: "create",
					serverFn: "createClass",
					payload: { ...data, id, idempotencyKey: id },
					idempotencyKey: id,
				});

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
				const { getLocalExpectedUpdatedAt, updateLocal, isReady } =
					await import("@/lib/local-db");
				const { enqueueAndFlushIfOnline } = await import(
					"@/lib/mutation-queue"
				);

				const expectedUpdatedAt = isReady()
					? await getLocalExpectedUpdatedAt("classes", id)
					: getExpectedUpdatedAt(
							getQueryClient().getQueryData(classQueries.detail(id).queryKey),
						);

				if (isReady()) {
					await updateLocal("classes", id, { ...data });
				}

				const idempotencyKey = uuidv7();
				await enqueueAndFlushIfOnline({
					scope: "classes",
					type: "update",
					serverFn: "updateClass",
					payload: { id, data, idempotencyKey, expectedUpdatedAt },
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
				const { deleteLocal, isReady } = await import("@/lib/local-db");
				const { enqueueAndFlushIfOnline } = await import(
					"@/lib/mutation-queue"
				);

				if (isReady()) {
					await deleteLocal("classes", id);
				}

				const idempotencyKey = uuidv7();
				await enqueueAndFlushIfOnline({
					scope: "classes",
					type: "delete",
					serverFn: "deleteClass",
					payload: { id, idempotencyKey },
					idempotencyKey,
				});

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
