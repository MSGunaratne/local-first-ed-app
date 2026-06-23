import { createServerFn } from "@tanstack/react-start";
import { baseMiddleware, idempotentMiddleware } from "@/lib/server-fn";
import {
	analyticsOverviewInputSchema,
	lessonFeedbackInputSchema,
} from "./analytics.schema";
import {
	getAdminAnalyticsOverview,
	submitLessonFeedback,
} from "./analytics.service";

export const getAdminAnalyticsOverviewFn = createServerFn({ method: "GET" })
	.middleware([baseMiddleware])
	.validator((data) => analyticsOverviewInputSchema.parse(data))
	.handler(async ({ data }) => {
		return getAdminAnalyticsOverview(data.lookbackDays);
	});

export const submitLessonFeedbackFn = createServerFn({ method: "POST" })
	.middleware([baseMiddleware, idempotentMiddleware])
	.validator((data) => lessonFeedbackInputSchema.parse(data))
	.handler(async ({ data }) => {
		return submitLessonFeedback(data);
	});
