ALTER TABLE `lesson` ADD `teacher_id` text REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null;
--> statement-breakpoint
CREATE INDEX `idx_lesson_teacher` ON `lesson` (`teacher_id`);
