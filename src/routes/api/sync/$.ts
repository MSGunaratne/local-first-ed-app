// ----------------------------------------------------------------------
// Unified Sync API: Provides incremental data for offline-first clients
// ----------------------------------------------------------------------

import { createFileRoute } from "@tanstack/react-router";
import { gt } from "drizzle-orm";
import { db } from "@/db";
import { classes } from "@/features/classes/classes.schema";
import { lessons } from "@/features/lessons/lessons.schema";
import { users } from "@/features/users/users.schema";

export const Route = createFileRoute("/api/sync/$")({
	server: {
		handlers: {
			GET: async ({
				request,
				params,
			}: {
				request: Request;
				params: { _: string };
			}) => {
				const scope = params._; // The splat parameter
				const url = new URL(request.url);
				const since = url.searchParams.get("since");

				try {
					const scope =
						params._ || new URL(request.url).pathname.split("/").pop();
					let data: any[] = [];
					const sinceDate =
						since && since !== "" ? new Date(since) : new Date(0);

					switch (scope) {
						case "lessons":
							data = await db.query.lessons.findMany({
								where: gt(lessons.updatedAt, sinceDate),
							});
							break;
						case "classes":
							data = await db.query.classes.findMany({
								where: gt(classes.updatedAt, sinceDate),
							});
							break;
						case "users":
							data = await db.query.user.findMany({
								where: gt(users.updatedAt, sinceDate),
							});
							break;
						default:
							return new Response(
								JSON.stringify({
									error: "Invalid scope",
									received: scope,
									params,
									url: request.url,
								}),
								{
									status: 400,
									headers: { "Content-Type": "application/json" },
								},
							);
					}

					return new Response(JSON.stringify({ data }), {
						status: 200,
						headers: { "Content-Type": "application/json" },
					});
				} catch (error) {
					console.error(`[Sync API] Error pulling ${scope}:`, error);
					return new Response(
						JSON.stringify({ error: "Internal Server Error" }),
						{
							status: 500,
							headers: { "Content-Type": "application/json" },
						},
					);
				}
			},
		},
	},
});
