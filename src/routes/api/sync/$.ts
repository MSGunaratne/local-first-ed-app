// ----------------------------------------------------------------------
// Unified Sync API: Provides incremental data for offline-first clients
// ----------------------------------------------------------------------

import { createFileRoute } from "@tanstack/react-router";
import { and, asc, eq, gt, or } from "drizzle-orm";
import { db } from "@/db";
import { classes } from "@/features/classes/classes.schema";
import { lessons } from "@/features/lessons/lessons.schema";
import { users } from "@/features/users/users.schema";
import { requireTeacherOrAdminSession } from "@/lib/auth/access";
import {
	parseSyncCursor,
	type SyncCursor,
	serializeSyncCursor,
} from "@/lib/sync-cursor";

const DEFAULT_LIMIT = 500;
const MAX_LIMIT = 1000;

function getLimit(url: URL) {
	const requested = Number.parseInt(url.searchParams.get("limit") ?? "", 10);
	if (!Number.isFinite(requested) || requested <= 0) {
		return DEFAULT_LIMIT;
	}
	return Math.min(requested, MAX_LIMIT);
}

function getCursorWhere(
	table: typeof lessons | typeof classes | typeof users,
	cursor: SyncCursor | null,
) {
	if (!cursor) {
		return undefined;
	}

	const updatedAt = new Date(cursor.updatedAt);
	if (Number.isNaN(updatedAt.getTime())) {
		return undefined;
	}

	return or(
		gt(table.updatedAt, updatedAt),
		and(eq(table.updatedAt, updatedAt), gt(table.id, cursor.id)),
	);
}

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
				const scope =
					params._ || new URL(request.url).pathname.split("/").pop() || "";
				const url = new URL(request.url);
				const cursor = parseSyncCursor(
					url.searchParams.get("cursor") ?? url.searchParams.get("since"),
				);
				const limit = getLimit(url);

				try {
					await requireTeacherOrAdminSession(
						"Only teachers and admins can sync offline data",
					);

					let data: Array<{ id: string; updatedAt: Date }> = [];

					switch (scope) {
						case "lessons":
							data = await db.query.lessons.findMany({
								where: getCursorWhere(lessons, cursor),
								orderBy: [asc(lessons.updatedAt), asc(lessons.id)],
								limit: limit + 1,
							});
							break;
						case "classes":
							data = await db.query.classes.findMany({
								where: getCursorWhere(classes, cursor),
								orderBy: [asc(classes.updatedAt), asc(classes.id)],
								limit: limit + 1,
							});
							break;
						case "users":
							data = await db.query.user.findMany({
								where: getCursorWhere(users, cursor),
								orderBy: [asc(users.updatedAt), asc(users.id)],
								limit: limit + 1,
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

					const hasMore = data.length > limit;
					const page = hasMore ? data.slice(0, limit) : data;
					const nextCursor = serializeSyncCursor(page.at(-1));

					return new Response(
						JSON.stringify({ data: page, cursor: nextCursor, hasMore }),
						{
							status: 200,
							headers: { "Content-Type": "application/json" },
						},
					);
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
