import { getRequestHeaders } from "@tanstack/react-start/server";
import { asc, count, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import type { QuickFilterConfig } from "@/db/utils/drizzle-filter";
import { buildDrizzleFilter, DataType } from "@/db/utils/drizzle-filter";
import {
	AuthorizationError,
	NotFoundError,
	ServerError,
} from "@/db/utils/errors";
import { safeAction } from "@/db/utils/safe-action";
import { auth } from "@/lib/auth";
import type { DataTableQueryParams } from "@/lib/dataTableSearchSchema";
import type { Class, ClassInsert } from "./classes.schema";
import { classes, classInsertSchema } from "./classes.schema";

// ----------------------------------------------------------------------

const classQuickFilterConfig: QuickFilterConfig<typeof classes> = {
	fields: [
		{ field: "name", type: DataType.String },
		{ field: "subject", type: DataType.String },
	],
};

// ----------------------------------------------------------------------

export async function getClasses(params: DataTableQueryParams) {
	const { pagination, sorting, columnFilters, globalFilter } = params;

	const page = pagination?.pageIndex ?? 0;
	const limit = pagination?.pageSize ?? 10;

	// Base filters from search/columns
	const searchFilters = buildDrizzleFilter(
		classes,
		columnFilters ?? [],
		globalFilter,
		classQuickFilterConfig,
	);

	// Optional: Filter by teacher if user is a teacher?
	// Or filter by visibility?
	// For now, let's assume admins and teachers can see all, or filter later.
	// If needed, we can add: and(searchFilters, eq(classes.teacherId, session.user.id))

	const sort = sorting?.[0];
	const sortField = (sort?.id as keyof Class) ?? "createdAt";
	const isDesc = sort?.desc ?? true;
	const orderBy = isDesc ? desc(classes[sortField]) : asc(classes[sortField]);

	const dataPromise = db
		.select()
		.from(classes)
		.where(searchFilters)
		.orderBy(orderBy)
		.limit(limit)
		.offset(page * limit);

	const totalPromise = db
		.select({ total: count() })
		.from(classes)
		.where(searchFilters);

	const [data, totalResult] = await Promise.all([dataPromise, totalPromise]);
	const total = totalResult[0]?.total ?? 0;
	const pageCount = Math.ceil(total / limit);

	return {
		data,
		meta: {
			page,
			limit,
			itemCount: total,
			pageCount,
			hasPreviousPage: page > 0,
			hasNextPage: page < pageCount - 1,
		},
	};
}

export async function getClassById(id: string) {
	const selectedClass = await db.query.classes.findFirst({
		where: eq(classes.id, id),
	});
	if (!selectedClass) {
		throw new NotFoundError("Class", id);
	}
	return selectedClass;
}

export async function createClass(data: ClassInsert) {
	return safeAction(async () => {
		const headers = await getRequestHeaders();
		const session = await auth.api.getSession({ headers });

		if (!session) {
			throw new AuthorizationError("You must be logged in to create a class");
		}

		// Ensure user is teacher or admin
		// if (session.user.role !== "teacher" && session.user.role !== "admin") ...

		const validatedData = classInsertSchema.parse(data);

		const result = await db
			.insert(classes)
			.values({
				...validatedData,
				teacherId: session.user.id, // Auto-assign to creating teacher
			})
			.returning();

		if (!result[0]) throw new ServerError("Failed to create class");

		// throw redirect({
		// 	to: "/classes",
		// 	search: {},
		// });
	});
}

export async function updateClass(id: string, data: Partial<ClassInsert>) {
	return safeAction(async () => {
		const headers = await getRequestHeaders();
		const session = await auth.api.getSession({ headers });
		if (!session)
			throw new AuthorizationError("You must be logged in to update a class");

		// TODO: Check if user owns the class or is admin

		const [updatedClass] = await db
			.update(classes)
			.set(data)
			.where(eq(classes.id, id))
			.returning();

		if (!updatedClass) {
			throw new ServerError("Failed to update class");
		}
		// throw redirect({
		// 	to: "/classes",
		// 	search: {},
		// });
	});
}

export async function deleteClass(id: string) {
	return safeAction(async () => {
		const headers = await getRequestHeaders();
		const session = await auth.api.getSession({ headers });
		if (!session)
			throw new AuthorizationError("You must be logged in to delete a class");

		await db.delete(classes).where(eq(classes.id, id));

		// Drizzle delete doesn't return success status in simple run, but if it throws it fails.
		// We can check rowsAffected if we used execute() or returned valid info,
		// but 'result' depends on driver.
		// For sqlite with drizzle-orm/libsql or better-sqlite3:
		// usually it just works or throws.
	});
}
