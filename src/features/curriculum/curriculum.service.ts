import { and, eq, isNull } from "drizzle-orm";
import { requireAdminSession } from "#/lib/auth/access";
import { db } from "@/db";
import { lessons } from "@/features/lessons/lessons.schema";

export interface CurriculumCoverageLessonLink {
	id: string;
	title: string;
	subject: string;
	gradeLevel: number;
	isPublished: boolean;
	linkedCurriculumIds: string[];
}

function asStringArray(value: unknown): string[] {
	if (!Array.isArray(value)) {
		return [];
	}

	return value.filter((item): item is string => typeof item === "string");
}

export async function getCurriculumCoverageLessonLinks(): Promise<
	CurriculumCoverageLessonLink[]
> {
	await requireAdminSession("Only admins can view curriculum coverage");

	const rows = await db
		.select({
			id: lessons.id,
			title: lessons.title,
			subject: lessons.subject,
			gradeLevel: lessons.gradeLevel,
			isPublished: lessons.isPublished,
			linkedCurriculumIds: lessons.linkedCurriculumIds,
		})
		.from(lessons)
		.where(and(isNull(lessons.deletedAt), eq(lessons.isDeleted, false)));

	return rows.map((row) => ({
		...row,
		linkedCurriculumIds: asStringArray(row.linkedCurriculumIds),
	}));
}
