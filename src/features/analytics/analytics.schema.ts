import { type InferSelectModel, sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { uuidv7 } from "uuidv7";
import { z } from "zod";
import { lessons } from "@/features/lessons/lessons.schema";
import { studentProfiles } from "@/features/students/students.schema";

export const engagementLogs = sqliteTable("engagement_log", {
	id: text("id")
		.primaryKey()
		.$defaultFn(() => uuidv7()),
	studentId: text("student_id")
		.notNull()
		.references(() => studentProfiles.id, { onDelete: "cascade" }),
	lessonId: text("lesson_id")
		.notNull()
		.references(() => lessons.id, { onDelete: "cascade" }),
	sessionStartTime: integer("session_start_time", {
		mode: "timestamp",
	}).notNull(),
	sessionDurationSeconds: integer("session_duration_seconds").notNull(),
	completionStatus: integer("completion_status").notNull(), // % completed? or boolean? User said "Boolean/% completed". Let's use integer for percentage (0-100) or maybe just number. User requirements: "Boolean/% completed". I'll stick to integer 0-100 for percentage.
	interactionType: text("interaction_type", {
		enum: ["read", "quiz_attempt", "survey"],
	}).notNull(),

	// Sync Fields
	lastModified: integer("last_modified", { mode: "timestamp" })
		.notNull()
		.default(sql`(unixepoch())`),
	syncStatus: text("sync_status", { enum: ["pending", "synced", "conflict"] })
		.notNull()
		.default("pending"),
	isDeleted: integer("is_deleted", { mode: "boolean" })
		.notNull()
		.default(false),

	createdAt: integer("created_at", { mode: "timestamp" })
		.notNull()
		.default(sql`(unixepoch())`), // Although sessionStartTime is there, createdAt is good metadata
});

export type EngagementLog = InferSelectModel<typeof engagementLogs>;

export const surveyResponses = sqliteTable("survey_response", {
	id: text("id")
		.primaryKey()
		.$defaultFn(() => uuidv7()),
	studentId: text("student_id")
		.notNull()
		.references(() => studentProfiles.id, { onDelete: "cascade" }),
	surveyType: text("survey_type", {
		enum: ["Environment_Check", "Engagement_Self_Report"],
	}).notNull(),
	responseData: text("response_data", { mode: "json" }).notNull(), // JSON e.g. {"noise_level": "high"}
	timestamp: integer("timestamp", { mode: "timestamp" }).notNull(),

	// Sync Fields
	lastModified: integer("last_modified", { mode: "timestamp" })
		.notNull()
		.default(sql`(unixepoch())`),
	syncStatus: text("sync_status", { enum: ["pending", "synced", "conflict"] })
		.notNull()
		.default("pending"),
	isDeleted: integer("is_deleted", { mode: "boolean" })
		.notNull()
		.default(false),
});

export type SurveyResponse = InferSelectModel<typeof surveyResponses>;

export const engagementLogInsertSchema = createInsertSchema(engagementLogs);
export type EngagementLogInsert = z.infer<typeof engagementLogInsertSchema>;

export const surveyResponseInsertSchema = createInsertSchema(surveyResponses, {
	responseData: z.record(z.string(), z.unknown()),
}).omit({
	id: true,
	syncStatus: true,
	lastModified: true,
	isDeleted: true,
});
export type SurveyResponseInsert = z.infer<typeof surveyResponseInsertSchema>;
