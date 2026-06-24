import { createFileRoute } from "@tanstack/react-router";
import { lessonQueries } from "@/features/lessons/lessons.queries";
import { ensureQueryDataAfterRestore } from "@/lib/query-client";

export const Route = createFileRoute("/_dashboard/lessons/$lessonId/edit")({
	loader: async ({ context: { queryClient }, params }) => {
		await ensureQueryDataAfterRestore(
			queryClient,
			lessonQueries.detail(params.lessonId),
		);
	},

});
