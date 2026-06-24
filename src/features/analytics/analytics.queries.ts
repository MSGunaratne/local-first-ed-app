import { mutationOptions, queryOptions } from "@tanstack/react-query";
import { uuidv7 } from "uuidv7";
import { getAdminAnalyticsOverviewFn } from "./analytics.actions";
import type { LessonFeedbackInput } from "./analytics.schema";

export const analyticsQueries = {
	all: () => ["analytics"] as const,
	overview: (lookbackDays = 7) =>
		queryOptions({
			queryKey: [...analyticsQueries.all(), "admin-overview", lookbackDays],
			queryFn: () => getAdminAnalyticsOverviewFn({ data: { lookbackDays } }),
			staleTime: 60_000,
		}),
};

export const analyticsMutations = {
	submitLessonFeedback: () =>
		mutationOptions({
			mutationFn: async (data: Omit<LessonFeedbackInput, "idempotencyKey">) => {
				const { enqueueAndFlushIfOnline } = await import(
					"@/lib/mutation-queue"
				);
				const idempotencyKey = uuidv7();

				await enqueueAndFlushIfOnline({
					scope: "analytics",
					type: "create",
					serverFn: "submitLessonFeedback",
					payload: {
						...data,
						idempotencyKey,
					},
					idempotencyKey,
				});

				return { queued: true };
			},
		}),
};
