import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const syncChanges = sqliteTable("sync_change", {
	revision: integer("revision").primaryKey({ autoIncrement: true }),
	scope: text("scope", { enum: ["users", "classes", "lessons"] }).notNull(),
	entityId: text("entity_id").notNull(),
	operation: text("operation", { enum: ["upsert", "delete"] }).notNull(),
	dataJson: text("data_json"),
	changedAt: integer("changed_at", { mode: "timestamp" })
		.notNull()
		.default(sql`(unixepoch())`),
});
