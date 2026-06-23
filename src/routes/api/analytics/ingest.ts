import { createFileRoute } from "@tanstack/react-router";
import { analyticsBatchIngestSchema } from "@/features/analytics/analytics.schema";
import { ingestAnalyticsBatch } from "@/features/analytics/analytics.service";

export const Route = createFileRoute("/api/analytics/ingest")({
	server: {
		handlers: {
			POST: async ({ request }: { request: Request }) => {
				try {
					const body = await request.json();
					const parsed = analyticsBatchIngestSchema.parse(body);

					await ingestAnalyticsBatch(parsed);

					return new Response(JSON.stringify({ success: true }), {
						status: 200,
						headers: {
							"Content-Type": "application/json",
						},
					});
				} catch (error) {
					console.error("[Analytics Ingest API Error]", error);
					return new Response(
						JSON.stringify({ error: "Invalid payload or server error" }),
						{
							status: 400,
							headers: {
								"Content-Type": "application/json",
							},
						},
					);
				}
			},
		},
	},
});
