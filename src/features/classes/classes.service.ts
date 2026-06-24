import { and, asc, count, desc, eq, isNull } from "drizzle-orm";
import {
	requireTeacherOrAdminSession,
	requireTeacherOwnershipOrAdmin,
} from "#/lib/auth/access";
import { db } from "@/db";
import type { QuickFilterConfig } from "@/db/utils/drizzle-filter";
import {
	buildDrizzleFilter,
	DataType,
	getDrizzleSortColumn,
} from "@/db/utils/drizzle-filter";
import { ConflictError, NotFoundError, ServerError } from "@/db/utils/errors";
import type { DataTableQueryParams } from "@/lib/dataTableSearchSchema";
import type { ClassInsert } from "./classes.schema";
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
	const whereClause = and(searchFilters, isNull(classes.deletedAt));

	// Optional: Filter by teacher if user is a teacher?
	// Or filter by visibility?
	// For now, let's assume admins and teachers can see all, or filter later.
	// If needed, we can add: and(searchFilters, eq(classes.teacherId, session.user.id))

	const { column, isDesc } = getDrizzleSortColumn(
		classes,
		sorting,
		"createdAt",
	);
	const orderBy = isDesc ? desc(column) : asc(column);

	const dataPromise = db
		.select()
		.from(classes)
		.where(whereClause)
		.orderBy(orderBy)
		.limit(limit)
		.offset(page * limit);

	const totalPromise = db
		.select({ total: count() })
		.from(classes)
		.where(whereClause);

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
		where: and(eq(classes.id, id), isNull(classes.deletedAt)),
	});
	if (!selectedClass) {
		throw new NotFoundError("Class", id);
	}
	return selectedClass;
}

export async function createClass(data: ClassInsert & { id?: string }) {
	const session = await requireTeacherOrAdminSession(
		"Only teachers and admins can create classes",
	);

	const validatedData = classInsertSchema.parse(data);

	const result = await db
		.insert(classes)
		.values({
			...validatedData,
			id: data.id,
			teacherId: session.user.id, // Auto-assign to creating teacher
		})
		.returning();

	if (!result[0]) throw new ServerError("Failed to create class");

	// throw redirect({
	// 	to: "/classes",
	// 	search: {},
	// });
}

export async function updateClass(
	id: string,
	data: Partial<ClassInsert>,
	expectedUpdatedAt?: Date | null,
) {
	const session = await requireTeacherOrAdminSession(
		"Only teachers and admins can update classes",
	);

	const existingClass = await db.query.classes.findFirst({
		where: eq(classes.id, id),
	});
	if (!existingClass) {
		throw new NotFoundError("Class", id);
	}

	requireTeacherOwnershipOrAdmin(
		existingClass.teacherId,
		session.user.id,
		session.user.role,
		"You can only update classes assigned to you",
	);

	if (
		expectedUpdatedAt &&
		existingClass.updatedAt.getTime() !== new Date(expectedUpdatedAt).getTime()
	) {
		throw new ConflictError(
			"This class was modified by another user. Please refresh and try again.",
			existingClass,
		);
	}

	const { teacherId: _ignoredTeacherId, ...safeUpdateData } = data;

	const [updatedClass] = await db
		.update(classes)
		.set(safeUpdateData)
		.where(eq(classes.id, id))
		.returning();

	if (!updatedClass) {
		throw new ServerError("Failed to update class");
	}
	// throw redirect({
	// 	to: "/classes",
	// 	search: {},
	// });
}

export async function deleteClass(id: string) {
	const session = await requireTeacherOrAdminSession(
		"Only teachers and admins can delete classes",
	);

	const existingClass = await db.query.classes.findFirst({
		where: eq(classes.id, id),
	});
	if (!existingClass) {
		throw new NotFoundError("Class", id);
	}

	requireTeacherOwnershipOrAdmin(
		existingClass.teacherId,
		session.user.id,
		session.user.role,
		"You can only delete classes assigned to you",
	);

	const now = new Date();
	await db
		.update(classes)
		.set({ deletedAt: now, updatedAt: now })
		.where(eq(classes.id, id));

	// Drizzle delete doesn't return success status in simple run, but if it throws it fails.
	// We can check rowsAffected if we used execute() or returned valid info,
	// but 'result' depends on driver.
	// For sqlite with drizzle-orm/libsql or better-sqlite3:
	// usually it just works or throws.
}
