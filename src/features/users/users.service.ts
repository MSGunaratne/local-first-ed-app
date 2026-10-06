import { getRequestHeaders } from "@tanstack/react-start/server";
import { asc, count, desc, eq } from "drizzle-orm";
import {
	requireAdminSession,
	requireSession,
	requireTeacherOrAdminSession,
} from "#/lib/auth/access";
import { db } from "@/db";
import type { QuickFilterConfig } from "@/db/utils/drizzle-filter";
import {
	buildDrizzleFilter,
	DataType,
	getDrizzleSortColumn,
} from "@/db/utils/drizzle-filter";
import { NotFoundError, ServerError } from "@/db/utils/errors";
import type { DataTableQueryParams } from "@/lib/dataTableSearchSchema";
import { throwIfAborted } from "@/lib/server-fn";
import { users } from "./users.schema";
import type { UserCreateInput, UserUpdateInput } from "./users.validation";
import {
	userCreateServerSchema,
	userUpdateServerSchema,
} from "./users.validation";

// ----------------------------------------------------------------------

const userQuickFilterConfig: QuickFilterConfig<typeof users> = {
	fields: [
		{ field: "name", type: DataType.String },
		{ field: "email", type: DataType.String },
	],
};

// ----------------------------------------------------------------------

/**
 * Fetches a paginated, filtered, and sorted list of users.
 * Used with TanStack Table for server-side data handling.
 */

export async function getUsers(
	params: DataTableQueryParams,
	abortSignal?: AbortSignal,
) {
	await requireTeacherOrAdminSession("Only staff can view users");
	throwIfAborted(abortSignal);
	const { pagination, sorting, columnFilters, globalFilter } = params;

	const page = pagination?.pageIndex ?? 0;
	const limit = pagination?.pageSize ?? 10;

	const userFilters = buildDrizzleFilter(
		users,
		columnFilters ?? [],
		globalFilter,
		userQuickFilterConfig,
	);

	// Initial naive single-column sort. Extend to multi-sort if needed.
	const { column, isDesc } = getDrizzleSortColumn(users, sorting, "createdAt");
	const orderBy = isDesc ? desc(column) : asc(column);

	const dataPromise = db
		.select()
		.from(users)
		.where(userFilters)
		.orderBy(orderBy)
		.limit(limit)
		.offset(page * limit); // TanStack pagination is 0-indexed

	const totalPromise = db
		.select({ total: count() })
		.from(users)
		.where(userFilters);

	const [data, totalResult] = await Promise.all([dataPromise, totalPromise]);
	throwIfAborted(abortSignal);
	const total = totalResult[0]?.total ?? 0;

	const pageCount = Math.ceil(total / limit);
	return {
		data,
		meta: {
			page, // pageIndex
			limit,
			itemCount: total,
			pageCount,
			hasPreviousPage: page > 0,
			hasNextPage: page < pageCount - 1,
		},
	};
}

/**
 * Fetches ALL matching users (no pagination) for CSV/export.
 * Uses the same filter/sort logic as getUsers but without LIMIT/OFFSET.
 */
export async function exportUsers(
	params: Omit<DataTableQueryParams, "pagination">,
) {
	await requireAdminSession("Only admins can export users");
	const { sorting, columnFilters, globalFilter } = params;

	const userFilters = buildDrizzleFilter(
		users,
		columnFilters ?? [],
		globalFilter,
		userQuickFilterConfig,
	);

	const { column, isDesc } = getDrizzleSortColumn(users, sorting, "createdAt");
	const orderBy = isDesc ? desc(column) : asc(column);

	return db.select().from(users).where(userFilters).orderBy(orderBy);
}

export async function getUserById(id: string) {
	await requireTeacherOrAdminSession("Only staff can view users");
	const selectedUser = await db.query.user.findFirst({
		where: eq(users.id, id),
	});
	if (!selectedUser) {
		throw new NotFoundError("User", id);
	}
	return selectedUser;
}

export async function createUser(data: UserCreateInput) {
	await requireAdminSession("Only admins can create users");
	const { auth } = await import("@/lib/auth");

	const validatedData = userCreateServerSchema.parse(data);

	const { user } = await auth.api.createUser({
		body: {
			name: validatedData.name,
			email: validatedData.email,
			password: validatedData.password,
			data: {
				phoneNumber: validatedData.phoneNumber ?? undefined,
			},
		},
	});
	if (!user) throw new ServerError("Failed to create user");

	return user;
}

export async function updateUser(id: string, userData: UserUpdateInput) {
	const headers = await getRequestHeaders();
	const session = await requireSession(
		"You must be logged in to update a user",
	);
	const { auth } = await import("@/lib/auth");

	const isSelf = session.user.id === id;

	const validatedData = userUpdateServerSchema.parse(userData);

	// If updating self, use Better Auth API to ensure session session is invalidated
	if (isSelf) {
		const updatedUser = await auth.api.updateUser({
			headers,
			body: {
				name: validatedData.name,
				image: validatedData.image ?? undefined,
				phoneNumber: validatedData.phoneNumber ?? undefined,
			},
		});

		if (!updatedUser) {
			throw new ServerError("Failed to update user profile");
		}
		return updatedUser;
	}

	await requireAdminSession("Only admins can update other users");

	const updatedUser = await auth.api.adminUpdateUser({
		headers,
		body: {
			userId: id,
			data: {
				...validatedData,
				image: validatedData.image ?? undefined,
				phoneNumber: validatedData.phoneNumber ?? undefined,
			},
		},
	});

	if (!updatedUser) {
		throw new ServerError("Failed to update user");
	}
	return updatedUser;
}

export async function deleteUser(id: string) {
	await requireAdminSession("Only admins can delete users");
	const headers = await getRequestHeaders();
	const { auth } = await import("@/lib/auth");

	const result = await auth.api.removeUser({
		headers,
		body: { userId: id },
	});

	if (result.success === false) throw new ServerError("Failed to delete user");
}

export type UserDetails = Awaited<ReturnType<typeof getUserById>>;
