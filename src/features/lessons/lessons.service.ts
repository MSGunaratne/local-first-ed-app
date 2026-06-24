import { and, asc, count, desc, eq, isNull } from "drizzle-orm";
import { requireTeacherOrAdminSession } from "#/lib/auth/access";
import { db } from "@/db";
import type { QuickFilterConfig } from "@/db/utils/drizzle-filter";
import { buildDrizzleFilter, DataType } from "@/db/utils/drizzle-filter";
import { ConflictError, NotFoundError, ServerError } from "@/db/utils/errors";
import type { DataTableQueryParams } from "@/lib/dataTableSearchSchema";
import { throwIfAborted } from "@/lib/server-fn";
import type { Lesson, LessonInsert } from "./lessons.schema";
import { lessonInsertSchema, lessons } from "./lessons.schema";

// ----------------------------------------------------------------------

const lessonQuickFilterConfig: QuickFilterConfig<typeof lessons> = {
	fields: [
		{ field: "title", type: DataType.String },
		{ field: "subject", type: DataType.String },
	],
};

// ----------------------------------------------------------------------

export async function getLessons(
	params: DataTableQueryParams,
	abortSignal?: AbortSignal,
) {
	throwIfAborted(abortSignal);
	const { pagination, sorting, columnFilters, globalFilter } = params;

	const page = pagination?.pageIndex ?? 0;
	const limit = pagination?.pageSize ?? 10;

	const searchFilters = buildDrizzleFilter(
		lessons,
		columnFilters ?? [],
		globalFilter,
		lessonQuickFilterConfig,
	);
	const whereClause = and(searchFilters, isNull(lessons.deletedAt));

	const sort = sorting?.[0];
	const sortField = (sort?.id as keyof Lesson) ?? "createdAt";
	const isDesc = sort?.desc ?? true;
	const orderBy = isDesc ? desc(lessons[sortField]) : asc(lessons[sortField]);

	const dataPromise = db
		.select()
		.from(lessons)
		.where(whereClause)
		.orderBy(orderBy)
		.limit(limit)
		.offset(page * limit);

	const totalPromise = db
		.select({ total: count() })
		.from(lessons)
		.where(whereClause);

	const [data, totalResult] = await Promise.all([dataPromise, totalPromise]);
	throwIfAborted(abortSignal);
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

export async function getLessonById(id: string) {
	const selectedLesson = await db.query.lessons.findFirst({
		where: and(eq(lessons.id, id), isNull(lessons.deletedAt)),
	});
	if (!selectedLesson) {
		throw new NotFoundError("Lesson", id);
	}
	return selectedLesson;
}

export async function createLesson(data: LessonInsert & { id?: string }) {
	await requireTeacherOrAdminSession(
		"Only teachers and admins can create lessons",
	);

	const validatedData = lessonInsertSchema.parse(data);

	const [newLesson] = await db
		.insert(lessons)
		.values({ ...validatedData, id: data.id })
		.returning();

	if (!newLesson) throw new ServerError("Failed to create lesson");

	return newLesson;
}

export async function updateLesson(
	id: string,
	data: Partial<LessonInsert>,
	expectedUpdatedAt?: Date | null,
) {
	await requireTeacherOrAdminSession(
		"Only teachers and admins can update lessons",
	);

	const existingLesson = await db.query.lessons.findFirst({
		where: eq(lessons.id, id),
	});
	if (!existingLesson) {
		throw new NotFoundError("Lesson", id);
	}

	if (
		expectedUpdatedAt &&
		existingLesson.updatedAt.getTime() !== new Date(expectedUpdatedAt).getTime()
	) {
		throw new ConflictError(
			"This lesson was modified by another user. Please refresh and try again.",
			existingLesson,
		);
	}

	const [updatedLesson] = await db
		.update(lessons)
		.set(data)
		.where(eq(lessons.id, id))
		.returning();

	if (!updatedLesson) {
		throw new ServerError("Failed to update lesson");
	}

	return updatedLesson;
}

export async function deleteLesson(id: string) {
	await requireTeacherOrAdminSession(
		"Only teachers and admins can delete lessons",
	);

	const existingLesson = await db.query.lessons.findFirst({
		where: eq(lessons.id, id),
	});
	if (!existingLesson) {
		throw new NotFoundError("Lesson", id);
	}

	const now = new Date();
	await db
		.update(lessons)
		.set({ deletedAt: now, isDeleted: true, updatedAt: now })
		.where(eq(lessons.id, id));
}

export type LessonDetails = Awaited<ReturnType<typeof getLessonById>>;
