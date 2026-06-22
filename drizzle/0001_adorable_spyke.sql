CREATE TABLE `analytics_daily_aggregate` (
	`id` text PRIMARY KEY NOT NULL,
	`day_utc` text NOT NULL,
	`actor_type` text NOT NULL,
	`role_bucket` text,
	`teacher_id` text,
	`class_id` text,
	`session_count` integer DEFAULT 0 NOT NULL,
	`dau_count` integer DEFAULT 0 NOT NULL,
	`avg_session_duration_sec` integer DEFAULT 0 NOT NULL,
	`page_views` integer DEFAULT 0 NOT NULL,
	`drop_off_count` integer DEFAULT 0 NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_analytics_daily_day` ON `analytics_daily_aggregate` (`day_utc`);--> statement-breakpoint
CREATE INDEX `idx_analytics_daily_teacher` ON `analytics_daily_aggregate` (`teacher_id`);--> statement-breakpoint
CREATE TABLE `analytics_event` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`pseudonymous_actor_id` text NOT NULL,
	`actor_type` text NOT NULL,
	`auth_state` text NOT NULL,
	`teacher_id` text,
	`event_type` text NOT NULL,
	`occurred_at` integer NOT NULL,
	`route_template` text,
	`referrer_template` text,
	`lesson_id` text,
	`class_id` text,
	`engagement_seconds` integer,
	`payload_json` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `analytics_session`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`lesson_id`) REFERENCES `lesson`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`class_id`) REFERENCES `class`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_analytics_event_idempotency` ON `analytics_event` (`idempotency_key`);--> statement-breakpoint
CREATE INDEX `idx_analytics_event_occurred_at` ON `analytics_event` (`occurred_at`);--> statement-breakpoint
CREATE INDEX `idx_analytics_event_type` ON `analytics_event` (`event_type`);--> statement-breakpoint
CREATE INDEX `idx_analytics_event_route` ON `analytics_event` (`route_template`);--> statement-breakpoint
CREATE INDEX `idx_analytics_event_teacher` ON `analytics_event` (`teacher_id`);--> statement-breakpoint
CREATE TABLE `analytics_session` (
	`id` text PRIMARY KEY NOT NULL,
	`pseudonymous_actor_id` text NOT NULL,
	`actor_type` text NOT NULL,
	`auth_state` text NOT NULL,
	`role_bucket` text,
	`teacher_id` text,
	`entry_route` text NOT NULL,
	`exit_route` text,
	`device_class` text DEFAULT 'unknown' NOT NULL,
	`os_family` text,
	`browser_family` text,
	`started_at` integer NOT NULL,
	`ended_at` integer,
	`duration_seconds` integer DEFAULT 0 NOT NULL,
	`active_seconds` integer DEFAULT 0 NOT NULL,
	`idle_seconds` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_analytics_session_started_at` ON `analytics_session` (`started_at`);--> statement-breakpoint
CREATE INDEX `idx_analytics_session_actor_type` ON `analytics_session` (`actor_type`);--> statement-breakpoint
CREATE INDEX `idx_analytics_session_teacher` ON `analytics_session` (`teacher_id`);--> statement-breakpoint
CREATE TABLE `lesson_feedback` (
	`id` text PRIMARY KEY NOT NULL,
	`idempotency_key` text NOT NULL,
	`lesson_id` text NOT NULL,
	`pseudonymous_actor_id` text NOT NULL,
	`actor_type` text NOT NULL,
	`auth_state` text NOT NULL,
	`role_bucket` text,
	`teacher_id` text,
	`rating` integer NOT NULL,
	`comment` text,
	`route_template` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`lesson_id`) REFERENCES `lesson`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_lesson_feedback_idempotency` ON `lesson_feedback` (`idempotency_key`);--> statement-breakpoint
CREATE INDEX `idx_lesson_feedback_lesson` ON `lesson_feedback` (`lesson_id`);--> statement-breakpoint
CREATE INDEX `idx_lesson_feedback_created_at` ON `lesson_feedback` (`created_at`);--> statement-breakpoint
DROP TABLE `engagement_log`;--> statement-breakpoint
DROP TABLE `survey_response`;