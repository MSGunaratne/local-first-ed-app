import { createFileRoute } from "@tanstack/react-router";
import { and, asc, eq, gt } from "drizzle-orm";
import { db } from "@/db";
import { normalizeError } from "@/db/utils/errors";
import { syncChanges } from "@/features/sync/sync.schema";
import { requireTeacherOrAdminSession } from "@/lib/auth/access";
import { parseSyncCursor } from "@/lib/sync-cursor";
import {
	SYNC_SCOPES,
	type SyncChange,
	type SyncPullResponse,
	type SyncScope,
} from "@/types/sync";

const DEFAULT_LIMIT = 250;
const MAX_LIMIT = 500;

function parseLimit(url: URL) {
	const value = Number(url.searchParams.get("limit"));
	return Number.isSafeInteger(value) && value > 0
		? Math.min(value, MAX_LIMIT)
		: DEFAULT_LIMIT;
}

function isSyncScope(value: string): value is SyncScope {
	return (SYNC_SCOPES as readonly string[]).includes(value);
}

function parseData(value: string | null) {
	if (!value) return null;
	const parsed: unknown = JSON.parse(value);
	if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
		throw new Error("Invalid sync change payload");
	}
	return parsed as Record<string, unknown>;
}

export const Route = createFileRoute("/api/sync/$")({
	server: {
		handlers: {
			GET: async ({ request, params }) => {
				try {
					await requireTeacherOrAdminSession(
						"Only teachers and admins can sync offline data",
					);
					const scope =
						params._splat ||
						new URL(request.url).pathname.split("/").pop() ||
						"";
					if (!isSyncScope(scope)) {
						return Response.json({ error: "Invalid scope" }, { status: 400 });
					}

					const url = new URL(request.url);
					const revision =
						parseSyncCursor(url.searchParams.get("revision")) ?? 0;
					const limit = parseLimit(url);
					const rows = await db
						.select()
						.from(syncChanges)
						.where(
							and(
								eq(syncChanges.scope, scope),
								gt(syncChanges.revision, revision),
							),
						)
						.orderBy(asc(syncChanges.revision))
						.limit(limit + 1);

					const hasMore = rows.length > limit;
					const page = hasMore ? rows.slice(0, limit) : rows;
					const changes: SyncChange[] = page.map((row) => ({
						revision: row.revision,
						scope,
						entityId: row.entityId,
						operation: row.operation,
						data:
							row.operation === "delete"
								? null
								: { ...parseData(row.dataJson), serverRevision: row.revision },
					}));
					const response: SyncPullResponse = {
						changes,
						revision: page.at(-1)?.revision ?? revision,
						hasMore,
					};
					return Response.json(response);
				} catch (error) {
					const normalized = normalizeError(error);
					return Response.json(
						{ error: normalized.message, code: normalized.code },
						{ status: normalized.status },
					);
				}
			},
		},
	},
});
