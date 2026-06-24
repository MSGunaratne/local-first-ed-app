import type { JSONContent } from "@tiptap/core";
import { type InferSelectModel, sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { uuidv7 } from "uuidv7";
import { z } from "zod";
import { QuestionType, Subject, SyncStatus } from "@/types/lesson";
import type { FlashcardItem } from "./lesson.types";

export const lessons = sqliteTable("lesson", {
	id: text("id")
		.primaryKey()
		.$defaultFn(() => uuidv7()),
	title: text("title").notNull(),
	subject: text("subject", {
		enum: [Subject.MATH, Subject.ENGLISH, Subject.ICT],
	}).notNull(),
	gradeLevel: integer("grade_level").notNull(),
	// TipTap JSON content (source of truth for editing)
	contentJson: text("content_json", { mode: "json" }).$type<JSONContent>(),
	// Pre-rendered HTML (for fast offline rendering without parsing)
	contentHtml: text("content_html"),
	// Original uploaded image URL (for reference)
	originalImageUrl: text("original_image_url"),
	linkedCurriculumIds: text("linked_curriculum_ids", { mode: "json" }).$type<
		string[]
	>(),
	estimatedDuration: integer("estimated_duration"),
	teacherNotes: text("teacher_notes"),

	//Future AI Features?
	// Brief summary for quick offline browsing
	lessonSummary: text("lesson_summary"),
	// Flashcard-style Q&A pairs for interactive review
	flashcards: text("flashcards", { mode: "json" }).$type<FlashcardItem[]>(),
	// Suggested classroom activities
	suggestedActivities: text("suggested_activities", { mode: "json" }).$type<
		string[]
	>(),

	isPublished: integer("is_published", { mode: "boolean" })
		.notNull()
		.default(false),

	// --- SYNC FIELDS ---
	lastModified: integer("last_modified", { mode: "timestamp" })
		.notNull()
		.default(sql`(unixepoch())`),
	syncStatus: text("sync_status", {
		enum: [SyncStatus.PENDING, SyncStatus.SYNCED, SyncStatus.CONFLICT],
	})
		.notNull()
		.default(SyncStatus.PENDING),
	isDeleted: integer("is_deleted", { mode: "boolean" })
		.notNull()
		.default(false),
	deletedAt: integer("deleted_at", { mode: "timestamp" }),

	createdAt: integer("created_at", { mode: "timestamp" })
		.notNull()
		.default(sql`(unixepoch())`),
	updatedAt: integer("updated_at", { mode: "timestamp" })
		.notNull()
		.default(sql`(unixepoch())`)
		.$onUpdate(() => new Date()),
});

export type Lesson = InferSelectModel<typeof lessons>;

export const assessments = sqliteTable("assessment", {
	id: text("id")
		.primaryKey()
		.$defaultFn(() => uuidv7()),
	lessonId: text("lesson_id")
		.notNull()
		.references(() => lessons.id, { onDelete: "cascade" }),
	questionText: text("question_text").notNull(),
	questionType: text("question_type", {
		enum: [QuestionType.MCQ, QuestionType.TEXT],
	}).notNull(),
	correctAnswer: text("correct_answer"),

	createdAt: integer("created_at", { mode: "timestamp" })
		.notNull()
		.default(sql`(unixepoch())`),
	updatedAt: integer("updated_at", { mode: "timestamp" })
		.notNull()
		.default(sql`(unixepoch())`)
		.$onUpdate(() => new Date()),
});

export type Assessment = InferSelectModel<typeof assessments>;

// -----------------------------------------------------------------------------
// const flashcardItemSchema = z.object({
// 	question: z.string().min(1),
// 	answer: z.string().min(1),
// });

export const lessonInsertSchema = createInsertSchema(lessons, {
	title: z.string().min(1, "Title is required").trim(),
	gradeLevel: z.number().min(6).max(12),
	contentJson: (sch) => sch.nullable(),
	contentHtml: z.string().nullable(),
	linkedCurriculumIds: z.array(z.string()).nullable(),
	estimatedDuration: z.number().min(1).max(300).nullable(),
	teacherNotes: z.string().nullable(),
	isPublished: z.boolean(),
}).omit({
	id: true,
	createdAt: true,
	updatedAt: true,
	syncStatus: true,
	lastModified: true,
	isDeleted: true,
	deletedAt: true,
	originalImageUrl: true,
	lessonSummary: true,
	flashcards: true,
	suggestedActivities: true,
});

export type LessonInsert = z.infer<typeof lessonInsertSchema>;
