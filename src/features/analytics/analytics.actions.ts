import { createServerFn } from "@tanstack/react-start";
import { baseMiddleware, idempotentMiddleware } from "@/lib/server-fn";
import {
	analyticsBatchIngestSchema,
	analyticsOverviewInputSchema,
	lessonFeedbackInputSchema,
} from "./analytics.schema";
import {
	getAdminAnalyticsOverview,
	ingestAnalyticsBatch,
	submitLessonFeedback,
} from "./analytics.service";

export const ingestAnalyticsBatchFn = createServerFn({ method: "POST" })
	.middleware([baseMiddleware, idempotentMiddleware])
	.inputValidator((data) => analyticsBatchIngestSchema.parse(data))
	.handler(async ({ data }) => {
		return ingestAnalyticsBatch(data);
	});

export const getAdminAnalyticsOverviewFn = createServerFn({ method: "GET" })
	.middleware([baseMiddleware])
	.inputValidator((data) => analyticsOverviewInputSchema.parse(data))
	.handler(async ({ data }) => {
		return getAdminAnalyticsOverview(data.lookbackDays);
	});

export const submitLessonFeedbackFn = createServerFn({ method: "POST" })
	.middleware([baseMiddleware, idempotentMiddleware])
	.inputValidator((data) => lessonFeedbackInputSchema.parse(data))
	.handler(async ({ data }) => {
		return submitLessonFeedback(data);
	});
