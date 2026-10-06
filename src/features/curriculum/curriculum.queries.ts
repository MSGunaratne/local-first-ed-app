import { queryOptions } from "@tanstack/react-query";
import { CURRICULUM_FILES } from "#/lib/content-mapper";
import type { CurriculumCoverageLessonLink } from "@/features/curriculum/curriculum.service";
import type { CurriculumItem } from "@/features/lessons/lesson.types";
import type { Lesson } from "@/features/lessons/lessons.schema";
import { Subject } from "@/types/lesson";
import { getCurriculumCoverageLessonLinksFn } from "./curriculum.actions";

async function fetchSubjectCurriculum(
	subject: Subject,
	signal?: AbortSignal,
): Promise<CurriculumItem[]> {
	const response = await fetch(CURRICULUM_FILES[subject], { signal });

	if (!response.ok) {
		throw new Error(`Failed to load curriculum for ${subject}`);
	}

	return (await response.json()) as CurriculumItem[];
}

async function fetchAllCurriculum(signal?: AbortSignal) {
	const subjects = Object.values(Subject);
	const subjectData = await Promise.all(
		subjects.map((subject) => fetchSubjectCurriculum(subject, signal)),
	);

	return subjectData.flat();
}

function asCurriculumCoverageLessonLink(
	lesson: Lesson,
): CurriculumCoverageLessonLink {
	return {
		id: lesson.id,
		title: lesson.title,
		subject: lesson.subject,
		gradeLevel: lesson.gradeLevel,
		isPublished: lesson.isPublished,
		linkedCurriculumIds: Array.isArray(lesson.linkedCurriculumIds)
			? lesson.linkedCurriculumIds
			: [],
	};
}

async function getCoverageLessonLinks(): Promise<
	CurriculumCoverageLessonLink[]
> {
	const { getLocalAll, isReady } = await import("@/lib/local-db");

	if (isReady()) {
		const localLessons = (await getLocalAll("lessons")) as Lesson[];
		if (localLessons.length > 0) {
			return localLessons.map(asCurriculumCoverageLessonLink);
		}
	}

	return getCurriculumCoverageLessonLinksFn();
}

export const curriculumQueries = {
	all: () => ["curriculum"] as const,
	coverage: () =>
		queryOptions({
			queryKey: [...curriculumQueries.all(), "coverage"],
			queryFn: async ({ signal }) => {
				const [curriculumItems, lessonLinks] = await Promise.all([
					fetchAllCurriculum(signal),
					getCoverageLessonLinks(),
				]);

				return {
					curriculumItems,
					lessonLinks,
				};
			},
			staleTime: 5 * 60_000,
		}),
};
