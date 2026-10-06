import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { syncChanges } from "./sync.schema";

export async function getServerRevision(
	scope: "lessons" | "classes" | "users",
	entityId: string,
) {
	const [row] = await db
		.select({ revision: syncChanges.revision })
		.from(syncChanges)
		.where(
			and(eq(syncChanges.scope, scope), eq(syncChanges.entityId, entityId)),
		)
		.orderBy(desc(syncChanges.revision))
		.limit(1);
	return row?.revision ?? 0;
}

export async function withServerRevision<T extends { id: string }>(
	scope: "lessons" | "classes" | "users",
	record: T,
) {
	return {
		...record,
		serverRevision: await getServerRevision(scope, record.id),
	};
}
