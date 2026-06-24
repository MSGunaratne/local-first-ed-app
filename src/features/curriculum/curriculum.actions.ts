import { createServerFn } from "@tanstack/react-start";
import { baseMiddleware } from "@/lib/server-fn";
import { getCurriculumCoverageLessonLinks } from "./curriculum.service";

export const getCurriculumCoverageLessonLinksFn = createServerFn({
	method: "GET",
})
	.middleware([baseMiddleware])
	.handler(async () => {
		return getCurriculumCoverageLessonLinks();
	});
