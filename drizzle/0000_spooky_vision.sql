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
	`last_heartbeat_at` integer,
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
CREATE TABLE `student_progress_daily_aggregate` (
	`id` text PRIMARY KEY NOT NULL,
	`day_utc` text NOT NULL,
	`lesson_id` text NOT NULL,
	`started_count` integer DEFAULT 0 NOT NULL,
	`completed_count` integer DEFAULT 0 NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`lesson_id`) REFERENCES `lesson`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_student_progress_daily_lesson` ON `student_progress_daily_aggregate` (`day_utc`,`lesson_id`);--> statement-breakpoint
CREATE INDEX `idx_student_progress_daily_day` ON `student_progress_daily_aggregate` (`day_utc`);--> statement-breakpoint
CREATE INDEX `idx_student_progress_daily_lesson_id` ON `student_progress_daily_aggregate` (`lesson_id`);--> statement-breakpoint
CREATE TABLE `class` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`subject` text NOT NULL,
	`teacher_id` text NOT NULL,
	`grade_level` integer NOT NULL,
	`deleted_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`teacher_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `enrollment` (
	`class_id` text NOT NULL,
	`student_id` text NOT NULL,
	`joined_at` integer DEFAULT (unixepoch()) NOT NULL,
	PRIMARY KEY(`class_id`, `student_id`),
	FOREIGN KEY (`class_id`) REFERENCES `class`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`student_id`) REFERENCES `student_profile`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `assessment` (
	`id` text PRIMARY KEY NOT NULL,
	`lesson_id` text NOT NULL,
	`question_text` text NOT NULL,
	`question_type` text NOT NULL,
	`correct_answer` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`lesson_id`) REFERENCES `lesson`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `lesson` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`subject` text NOT NULL,
	`grade_level` integer NOT NULL,
	`teacher_id` text,
	`content_json` text,
	`original_image_url` text,
	`linked_curriculum_ids` text,
	`estimated_duration` integer,
	`teacher_notes` text,
	`lesson_summary` text,
	`flashcards` text,
	`suggested_activities` text,
	`is_published` integer DEFAULT false NOT NULL,
	`last_modified` integer DEFAULT (unixepoch()) NOT NULL,
	`sync_status` text DEFAULT 'pending' NOT NULL,
	`is_deleted` integer DEFAULT false NOT NULL,
	`deleted_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`teacher_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `student_profile` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`grade_level` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `student_profile_user_id_unique` ON `student_profile` (`user_id`);--> statement-breakpoint
CREATE TABLE `sync_change` (
	`revision` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`scope` text NOT NULL,
	`entity_id` text NOT NULL,
	`operation` text NOT NULL,
	`data_json` text,
	`changed_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `account` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`user_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`password` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL,
	`token` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`user_id` text NOT NULL,
	`impersonated_by` text,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_token_unique` ON `session` (`token`);--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`image` text,
	`phone_number` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	`role` text NOT NULL,
	`banned` integer DEFAULT false,
	`ban_reason` text,
	`ban_expires` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `user_phone_number_unique` ON `user` (`phone_number`);--> statement-breakpoint
CREATE TABLE `verification` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch()),
	`updated_at` integer DEFAULT (unixepoch())
);
