import { createServerFn } from "@tanstack/react-start";
import { idInputSchema } from "@/lib/commonServerFnSchema";
import { baseMiddleware, idempotentMiddleware } from "@/lib/server-fn";
import {
	analyticsOverviewInputSchema,
	lessonFeedbackInputSchema,
	studentProgressEventInputSchema,
} from "./analytics.schema";
import {
	getAdminAnalyticsOverview,
	getLessonAnalyticsDetails,
	submitLessonFeedback,
	submitStudentProgressEvent,
} from "./analytics.service";

export const getAdminAnalyticsOverviewFn = createServerFn({ method: "GET" })
	.middleware([baseMiddleware])
	.validator((data) => analyticsOverviewInputSchema.parse(data))
	.handler(async ({ data }) => {
		return getAdminAnalyticsOverview(data.lookbackDays);
	});

export const getLessonAnalyticsDetailsFn = createServerFn({ method: "GET" })
	.middleware([baseMiddleware])
	.validator((data) => idInputSchema.parse(data))
	.handler(async ({ data }) => {
		return getLessonAnalyticsDetails(data.id);
	});

export const submitLessonFeedbackFn = createServerFn({ method: "POST" })
	.middleware([baseMiddleware, idempotentMiddleware])
	.validator((data) => lessonFeedbackInputSchema.parse(data))
	.handler(async ({ data }) => {
		return submitLessonFeedback(data);
	});

export const submitStudentProgressEventFn = createServerFn({ method: "POST" })
	.middleware([idempotentMiddleware])
	.validator((data) => studentProgressEventInputSchema.parse(data))
	.handler(async ({ data }) => {
		return submitStudentProgressEvent(data);
	});
