CREATE TABLE `student_progress_daily_aggregate` (
	`id` text PRIMARY KEY NOT NULL,
	`day_utc` text NOT NULL,
	`lesson_id` text NOT NULL,
	`started_count` integer DEFAULT 0 NOT NULL,
	`completed_count` integer DEFAULT 0 NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`lesson_id`) REFERENCES `lesson`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE UNIQUE INDEX `idx_student_progress_daily_lesson` ON `student_progress_daily_aggregate` (`day_utc`,`lesson_id`);
CREATE INDEX `idx_student_progress_daily_day` ON `student_progress_daily_aggregate` (`day_utc`);
CREATE INDEX `idx_student_progress_daily_lesson_id` ON `student_progress_daily_aggregate` (`lesson_id`);
