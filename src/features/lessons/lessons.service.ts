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
import {
	getServerRevision,
	withServerRevision,
} from "@/features/sync/sync.service";
import type { DataTableQueryParams } from "@/lib/dataTableSearchSchema";
import { throwIfAborted } from "@/lib/server-fn";
import type { LessonInsert } from "./lessons.schema";
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
	visibility: "staff" | "published" = "staff",
) {
	if (visibility === "staff") {
		await requireTeacherOrAdminSession("Only staff can view draft lessons");
	}
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
	const whereClause = and(
		searchFilters,
		isNull(lessons.deletedAt),
		visibility === "published" ? eq(lessons.isPublished, true) : undefined,
	);

	const { column, isDesc } = getDrizzleSortColumn(
		lessons,
		sorting,
		"createdAt",
	);
	const orderBy = isDesc ? desc(column) : asc(column);

	const dataPromise = db.query.lessons
		.findMany({
			where: whereClause,
			orderBy,
			limit,
			offset: page * limit,
			with: {
				teacher: {
					columns: {
						name: true,
					},
				},
			},
		})
		.then((rows) =>
			rows.map(({ teacher, ...lesson }) => ({
				...lesson,
				teacherName: teacher?.name ?? null,
			})),
		);

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

export type LessonListItem = Awaited<
	ReturnType<typeof getLessons>
>["data"][number];

export async function getLessonById(
	id: string,
	visibility: "staff" | "published" = "staff",
) {
	if (visibility === "staff") {
		await requireTeacherOrAdminSession("Only staff can view draft lessons");
	}
	const selectedLesson = await db.query.lessons.findFirst({
		where: and(
			eq(lessons.id, id),
			isNull(lessons.deletedAt),
			visibility === "published" ? eq(lessons.isPublished, true) : undefined,
		),
	});
	if (!selectedLesson) {
		throw new NotFoundError("Lesson", id);
	}
	return withServerRevision("lessons", selectedLesson);
}

export async function createLesson(data: LessonInsert & { id?: string }) {
	const session = await requireTeacherOrAdminSession(
		"Only teachers and admins can create lessons",
	);

	const validatedData = lessonInsertSchema.parse(data);

	const [newLesson] = await db
		.insert(lessons)
		.values({ ...validatedData, id: data.id, teacherId: session.user.id })
		.returning();

	if (!newLesson) throw new ServerError("Failed to create lesson");

	return withServerRevision("lessons", newLesson);
}

export async function updateLesson(
	id: string,
	data: Partial<LessonInsert>,
	expectedRevision?: number,
) {
	const session = await requireTeacherOrAdminSession(
		"Only teachers and admins can update lessons",
	);

	const existingLesson = await db.query.lessons.findFirst({
		where: eq(lessons.id, id),
	});
	if (!existingLesson) {
		throw new NotFoundError("Lesson", id);
	}
	requireTeacherOwnershipOrAdmin(
		existingLesson.teacherId ?? "",
		session.user.id,
		session.user.role,
		"You can only update lessons you own",
	);

	const currentRevision = await getServerRevision("lessons", id);
	if (expectedRevision !== undefined && expectedRevision !== currentRevision) {
		throw new ConflictError(
			"This lesson was modified by another user. Please refresh and try again.",
			{ ...existingLesson, serverRevision: currentRevision },
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

	return withServerRevision("lessons", updatedLesson);
}

export async function deleteLesson(id: string, expectedRevision?: number) {
	const session = await requireTeacherOrAdminSession(
		"Only teachers and admins can delete lessons",
	);

	const existingLesson = await db.query.lessons.findFirst({
		where: eq(lessons.id, id),
	});
	if (!existingLesson) {
		throw new NotFoundError("Lesson", id);
	}
	requireTeacherOwnershipOrAdmin(
		existingLesson.teacherId ?? "",
		session.user.id,
		session.user.role,
		"You can only delete lessons you own",
	);
	const currentRevision = await getServerRevision("lessons", id);
	if (expectedRevision !== undefined && expectedRevision !== currentRevision) {
		throw new ConflictError(
			"This lesson was modified by another user. Please refresh and try again.",
			{ ...existingLesson, serverRevision: currentRevision },
		);
	}

	const now = new Date();
	await db
		.update(lessons)
		.set({ deletedAt: now, isDeleted: true, updatedAt: now })
		.where(eq(lessons.id, id));
	return {
		id,
		deleted: true,
		serverRevision: await getServerRevision("lessons", id),
	};
}

export async function restoreLesson(
	id: string,
	data: LessonInsert,
	expectedRevision?: number,
) {
	const session = await requireTeacherOrAdminSession(
		"Only teachers and admins can restore lessons",
	);
	const existingLesson = await db.query.lessons.findFirst({
		where: eq(lessons.id, id),
	});
	if (!existingLesson) throw new NotFoundError("Lesson", id);
	requireTeacherOwnershipOrAdmin(
		existingLesson.teacherId ?? "",
		session.user.id,
		session.user.role,
		"You can only restore lessons you own",
	);
	const currentRevision = await getServerRevision("lessons", id);
	if (expectedRevision !== undefined && expectedRevision !== currentRevision) {
		throw new ConflictError(
			"This deleted lesson changed before it could be restored.",
			{ ...existingLesson, serverRevision: currentRevision },
		);
	}
	const validatedData = lessonInsertSchema.parse(data);
	const now = new Date();
	const [restoredLesson] = await db
		.update(lessons)
		.set({
			...validatedData,
			deletedAt: null,
			isDeleted: false,
			lastModified: now,
			updatedAt: now,
		})
		.where(eq(lessons.id, id))
		.returning();
	if (!restoredLesson) throw new ServerError("Failed to restore lesson");
	return withServerRevision("lessons", restoredLesson);
}

export type LessonDetails = Awaited<ReturnType<typeof getLessonById>>;
