import { type InferSelectModel, sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { uuidv7 } from "uuidv7";
import { z } from "zod";
import { users } from "@/features/users/users.schema";

export const studentProfiles = sqliteTable("student_profile", {
	id: text("id")
		.primaryKey()
		.$defaultFn(() => uuidv7()),
	userId: text("user_id")
		.notNull()
		.references(() => users.id, { onDelete: "cascade" }),
	gradeLevel: integer("grade_level").notNull(),
	createdAt: integer("created_at", { mode: "timestamp" })
		.notNull()
		.default(sql`(unixepoch())`),
	updatedAt: integer("updated_at", { mode: "timestamp" })
		.notNull()
		.default(sql`(unixepoch())`)
		.$onUpdate(() => new Date()),
});

export type StudentProfile = InferSelectModel<typeof studentProfiles>;

export const studentProfileInsertSchema = createInsertSchema(studentProfiles, {
	gradeLevel: z.number().min(6).max(12),
}).omit({
	id: true,
	createdAt: true,
	updatedAt: true,
});

export type StudentProfileInsert = z.infer<typeof studentProfileInsertSchema>;
