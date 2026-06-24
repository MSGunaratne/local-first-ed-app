import { type InferSelectModel, relations, sql } from "drizzle-orm";
import {
	index,
	integer,
	sqliteTable,
	text,
	uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { uuidv7 } from "uuidv7";
import { z } from "zod";
import { classes } from "@/features/classes/classes.schema";
import { lessons } from "@/features/lessons/lessons.schema";
import {
	ANALYTICS_EVENT_TYPES,
	ACTOR_TYPES,
	AUTH_STATES,
	DEVICE_CLASSES,
} from "#/types/analytics";
import { Role } from "#/types/user";

export const analyticsSessions = sqliteTable(
	"analytics_session",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => uuidv7()),
		pseudonymousActorId: text("pseudonymous_actor_id").notNull(),
		actorType: text("actor_type", { enum: ACTOR_TYPES }).notNull(),
		authState: text("auth_state", { enum: AUTH_STATES }).notNull(),
		roleBucket: text("role_bucket", {
			enum: [Role.SUPER_ADMIN, Role.ADMIN, Role.TEACHER],
		}),
		teacherId: text("teacher_id"),
		entryRoute: text("entry_route").notNull(),
		exitRoute: text("exit_route"),
		deviceClass: text("device_class", { enum: DEVICE_CLASSES })
			.notNull()
			.default("unknown"),
		osFamily: text("os_family"),
		browserFamily: text("browser_family"),
		startedAt: integer("started_at", { mode: "timestamp" }).notNull(),
		endedAt: integer("ended_at", { mode: "timestamp" }),
		lastHeartbeatAt: integer("last_heartbeat_at", { mode: "timestamp" }),
		durationSeconds: integer("duration_seconds").notNull().default(0),
		activeSeconds: integer("active_seconds").notNull().default(0),
		idleSeconds: integer("idle_seconds").notNull().default(0),
		createdAt: integer("created_at", { mode: "timestamp" })
			.notNull()
			.default(sql`(unixepoch())`),
	},
	(table) => [
		index("idx_analytics_session_started_at").on(table.startedAt),
		index("idx_analytics_session_actor_type").on(table.actorType),
		index("idx_analytics_session_teacher").on(table.teacherId),
	],
);

export const analyticsEvents = sqliteTable(
	"analytics_event",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => uuidv7()),
		sessionId: text("session_id")
			.notNull()
			.references(() => analyticsSessions.id, { onDelete: "cascade" }),
		idempotencyKey: text("idempotency_key").notNull(),
		pseudonymousActorId: text("pseudonymous_actor_id").notNull(),
		actorType: text("actor_type", { enum: ACTOR_TYPES }).notNull(),
		authState: text("auth_state", { enum: AUTH_STATES }).notNull(),
		teacherId: text("teacher_id"),
		eventType: text("event_type", { enum: ANALYTICS_EVENT_TYPES }).notNull(),
		occurredAt: integer("occurred_at", { mode: "timestamp" }).notNull(),
		routeTemplate: text("route_template"),
		referrerTemplate: text("referrer_template"),
		lessonId: text("lesson_id").references(() => lessons.id, {
			onDelete: "set null",
		}),
		classId: text("class_id").references(() => classes.id, {
			onDelete: "set null",
		}),
		engagementSeconds: integer("engagement_seconds"),
		payloadJson: text("payload_json", { mode: "json" }),
		createdAt: integer("created_at", { mode: "timestamp" })
			.notNull()
			.default(sql`(unixepoch())`),
	},
	(table) => [
		uniqueIndex("idx_analytics_event_idempotency").on(table.idempotencyKey),
		index("idx_analytics_event_occurred_at").on(table.occurredAt),
		index("idx_analytics_event_type").on(table.eventType),
		index("idx_analytics_event_route").on(table.routeTemplate),
		index("idx_analytics_event_teacher").on(table.teacherId),
	],
);

export const analyticsDailyAggregates = sqliteTable(
	"analytics_daily_aggregate",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => uuidv7()),
		dayUtc: text("day_utc").notNull(),
		actorType: text("actor_type", { enum: ACTOR_TYPES }).notNull(),
		roleBucket: text("role_bucket", {
			enum: [Role.SUPER_ADMIN, Role.ADMIN, Role.TEACHER],
		}),
		teacherId: text("teacher_id"),
		classId: text("class_id"),
		sessionCount: integer("session_count").notNull().default(0),
		dauCount: integer("dau_count").notNull().default(0),
		avgSessionDurationSec: integer("avg_session_duration_sec")
			.notNull()
			.default(0),
		pageViews: integer("page_views").notNull().default(0),
		dropOffCount: integer("drop_off_count").notNull().default(0),
		updatedAt: integer("updated_at", { mode: "timestamp" })
			.notNull()
			.default(sql`(unixepoch())`)
			.$onUpdate(() => new Date()),
	},
	(table) => [
		index("idx_analytics_daily_day").on(table.dayUtc),
		index("idx_analytics_daily_teacher").on(table.teacherId),
	],
);

export const lessonFeedback = sqliteTable(
	"lesson_feedback",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => uuidv7()),
		idempotencyKey: text("idempotency_key").notNull(),
		lessonId: text("lesson_id")
			.notNull()
			.references(() => lessons.id, { onDelete: "cascade" }),
		pseudonymousActorId: text("pseudonymous_actor_id").notNull(),
		actorType: text("actor_type", { enum: ACTOR_TYPES }).notNull(),
		authState: text("auth_state", { enum: AUTH_STATES }).notNull(),
		roleBucket: text("role_bucket", {
			enum: [Role.SUPER_ADMIN, Role.ADMIN, Role.TEACHER],
		}),
		teacherId: text("teacher_id"),
		rating: integer("rating").notNull(),
		comment: text("comment"),
		routeTemplate: text("route_template"),
		createdAt: integer("created_at", { mode: "timestamp" })
			.notNull()
			.default(sql`(unixepoch())`),
	},
	(table) => [
		uniqueIndex("idx_lesson_feedback_idempotency").on(table.idempotencyKey),
		index("idx_lesson_feedback_lesson").on(table.lessonId),
		index("idx_lesson_feedback_created_at").on(table.createdAt),
	],
);

export const studentProgressDailyAggregates = sqliteTable(
	"student_progress_daily_aggregate",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => uuidv7()),
		dayUtc: text("day_utc").notNull(),
		lessonId: text("lesson_id")
			.notNull()
			.references(() => lessons.id, { onDelete: "cascade" }),
		startedCount: integer("started_count").notNull().default(0),
		completedCount: integer("completed_count").notNull().default(0),
		updatedAt: integer("updated_at", { mode: "timestamp" })
			.notNull()
			.default(sql`(unixepoch())`)
			.$onUpdate(() => new Date()),
	},
	(table) => [
		uniqueIndex("idx_student_progress_daily_lesson").on(
			table.dayUtc,
			table.lessonId,
		),
		index("idx_student_progress_daily_day").on(table.dayUtc),
		index("idx_student_progress_daily_lesson_id").on(table.lessonId),
	],
);

export const analyticsSessionRelations = relations(
	analyticsSessions,
	({ many }) => ({
		events: many(analyticsEvents),
	}),
);

export const analyticsEventRelations = relations(
	analyticsEvents,
	({ one }) => ({
		session: one(analyticsSessions, {
			fields: [analyticsEvents.sessionId],
			references: [analyticsSessions.id],
		}),
		lesson: one(lessons, {
			fields: [analyticsEvents.lessonId],
			references: [lessons.id],
		}),
		class: one(classes, {
			fields: [analyticsEvents.classId],
			references: [classes.id],
		}),
	}),
);

export const lessonFeedbackRelations = relations(lessonFeedback, ({ one }) => ({
	lesson: one(lessons, {
		fields: [lessonFeedback.lessonId],
		references: [lessons.id],
	}),
}));

export type AnalyticsSession = InferSelectModel<typeof analyticsSessions>;
export type AnalyticsEvent = InferSelectModel<typeof analyticsEvents>;
export type AnalyticsDailyAggregate = InferSelectModel<
	typeof analyticsDailyAggregates
>;
export type LessonFeedback = InferSelectModel<typeof lessonFeedback>;
export type StudentProgressDailyAggregate = InferSelectModel<
	typeof studentProgressDailyAggregates
>;

export const analyticsSessionInsertSchema = createInsertSchema(
	analyticsSessions,
	{
		startedAt: z.coerce.date(),
		endedAt: z.coerce.date().optional().nullable(),
	},
).omit({
	createdAt: true,
});

export const analyticsEventInsertSchema = createInsertSchema(analyticsEvents, {
	occurredAt: z.coerce.date(),
	payloadJson: z.record(z.string(), z.unknown()).optional(),
}).omit({
	id: true,
	createdAt: true,
});

export const analyticsBatchIngestSchema = z.object({
	idempotencyKey: z.string().min(1),
	sessions: z.array(analyticsSessionInsertSchema).max(20).default([]),
	events: z.array(analyticsEventInsertSchema).max(200).default([]),
});

export const analyticsOverviewInputSchema = z.object({
	lookbackDays: z.number().min(1).max(90).default(7),
});

export const lessonFeedbackInputSchema = createInsertSchema(lessonFeedback, {
	rating: z.number().int().min(1).max(5),
	comment: z
		.string()
		.trim()
		.max(500)
		.optional()
		.transform((value) => (value && value.length > 0 ? value : undefined)),
}).omit({
	id: true,
	createdAt: true,
	actorType: true,
	authState: true,
	roleBucket: true,
	teacherId: true,
});

export const studentProgressEventInputSchema = z.object({
	idempotencyKey: z.string().min(1),
	lessonId: z.string().min(1),
	status: z.enum(["started", "completed"]),
	occurredAt: z.coerce.date(),
});

export type AnalyticsSessionInsert = z.infer<
	typeof analyticsSessionInsertSchema
>;
export type AnalyticsEventInsert = z.infer<typeof analyticsEventInsertSchema>;
export type AnalyticsBatchIngest = z.infer<typeof analyticsBatchIngestSchema>;
export type LessonFeedbackInput = z.infer<typeof lessonFeedbackInputSchema>;
export type StudentProgressEventInput = z.infer<
	typeof studentProgressEventInputSchema
>;
//not in use
export type AnalyticsOverviewInput = z.infer<
	typeof analyticsOverviewInputSchema
>;
