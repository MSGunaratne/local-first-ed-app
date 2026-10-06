CREATE INDEX `idx_sync_change_scope_revision`
	ON `sync_change` (`scope`, `revision`);--> statement-breakpoint
CREATE INDEX `idx_sync_change_entity_revision`
	ON `sync_change` (`scope`, `entity_id`, `revision`);--> statement-breakpoint

CREATE TRIGGER `sync_user_after_insert`
AFTER INSERT ON `user`
BEGIN
	INSERT INTO `sync_change` (`scope`, `entity_id`, `operation`, `data_json`)
	VALUES (
		'users',
		NEW.`id`,
		'upsert',
		json_object(
			'id', NEW.`id`,
			'name', NEW.`name`,
			'updatedAt', NEW.`updated_at`,
			'role', NEW.`role`
		)
	);
END;--> statement-breakpoint

CREATE TRIGGER `sync_user_after_update`
AFTER UPDATE ON `user`
BEGIN
	INSERT INTO `sync_change` (`scope`, `entity_id`, `operation`, `data_json`)
	VALUES (
		'users',
		NEW.`id`,
		'upsert',
		json_object(
			'id', NEW.`id`,
			'name', NEW.`name`,
			'updatedAt', NEW.`updated_at`,
			'role', NEW.`role`
		)
	);
END;--> statement-breakpoint

CREATE TRIGGER `sync_user_after_delete`
AFTER DELETE ON `user`
BEGIN
	INSERT INTO `sync_change` (`scope`, `entity_id`, `operation`, `data_json`)
	VALUES ('users', OLD.`id`, 'delete', NULL);
END;--> statement-breakpoint

CREATE TRIGGER `sync_class_after_insert`
AFTER INSERT ON `class`
BEGIN
	INSERT INTO `sync_change` (`scope`, `entity_id`, `operation`, `data_json`)
	VALUES (
		'classes',
		NEW.`id`,
		CASE WHEN NEW.`deleted_at` IS NULL THEN 'upsert' ELSE 'delete' END,
		CASE WHEN NEW.`deleted_at` IS NULL THEN json_object(
			'id', NEW.`id`,
			'name', NEW.`name`,
			'subject', NEW.`subject`,
			'teacherId', NEW.`teacher_id`,
			'gradeLevel', NEW.`grade_level`,
			'deletedAt', NEW.`deleted_at`,
			'createdAt', NEW.`created_at`,
			'updatedAt', NEW.`updated_at`
		) ELSE NULL END
	);
END;--> statement-breakpoint

CREATE TRIGGER `sync_class_after_update`
AFTER UPDATE ON `class`
BEGIN
	INSERT INTO `sync_change` (`scope`, `entity_id`, `operation`, `data_json`)
	VALUES (
		'classes',
		NEW.`id`,
		CASE WHEN NEW.`deleted_at` IS NULL THEN 'upsert' ELSE 'delete' END,
		CASE WHEN NEW.`deleted_at` IS NULL THEN json_object(
			'id', NEW.`id`,
			'name', NEW.`name`,
			'subject', NEW.`subject`,
			'teacherId', NEW.`teacher_id`,
			'gradeLevel', NEW.`grade_level`,
			'deletedAt', NEW.`deleted_at`,
			'createdAt', NEW.`created_at`,
			'updatedAt', NEW.`updated_at`
		) ELSE NULL END
	);
END;--> statement-breakpoint

CREATE TRIGGER `sync_class_after_delete`
AFTER DELETE ON `class`
BEGIN
	INSERT INTO `sync_change` (`scope`, `entity_id`, `operation`, `data_json`)
	VALUES ('classes', OLD.`id`, 'delete', NULL);
END;--> statement-breakpoint

CREATE TRIGGER `sync_lesson_after_insert`
AFTER INSERT ON `lesson`
BEGIN
	INSERT INTO `sync_change` (`scope`, `entity_id`, `operation`, `data_json`)
	VALUES (
		'lessons',
		NEW.`id`,
		CASE
			WHEN NEW.`is_deleted` = 1 OR NEW.`deleted_at` IS NOT NULL THEN 'delete'
			ELSE 'upsert'
		END,
		CASE
			WHEN NEW.`is_deleted` = 1 OR NEW.`deleted_at` IS NOT NULL THEN NULL
			ELSE json_object(
				'id', NEW.`id`,
				'title', NEW.`title`,
				'subject', NEW.`subject`,
				'gradeLevel', NEW.`grade_level`,
				'teacherId', NEW.`teacher_id`,
				'contentJson', CASE WHEN NEW.`content_json` IS NULL THEN NULL ELSE json(NEW.`content_json`) END,
				'originalImageUrl', NEW.`original_image_url`,
				'linkedCurriculumIds', CASE WHEN NEW.`linked_curriculum_ids` IS NULL THEN NULL ELSE json(NEW.`linked_curriculum_ids`) END,
				'estimatedDuration', NEW.`estimated_duration`,
				'teacherNotes', NEW.`teacher_notes`,
				'lessonSummary', NEW.`lesson_summary`,
				'flashcards', CASE WHEN NEW.`flashcards` IS NULL THEN NULL ELSE json(NEW.`flashcards`) END,
				'suggestedActivities', CASE WHEN NEW.`suggested_activities` IS NULL THEN NULL ELSE json(NEW.`suggested_activities`) END,
				'isPublished', NEW.`is_published`,
				'lastModified', NEW.`last_modified`,
				'isDeleted', NEW.`is_deleted`,
				'deletedAt', NEW.`deleted_at`,
				'createdAt', NEW.`created_at`,
				'updatedAt', NEW.`updated_at`
			)
		END
	);
END;--> statement-breakpoint

CREATE TRIGGER `sync_lesson_after_update`
AFTER UPDATE ON `lesson`
BEGIN
	INSERT INTO `sync_change` (`scope`, `entity_id`, `operation`, `data_json`)
	VALUES (
		'lessons',
		NEW.`id`,
		CASE
			WHEN NEW.`is_deleted` = 1 OR NEW.`deleted_at` IS NOT NULL THEN 'delete'
			ELSE 'upsert'
		END,
		CASE
			WHEN NEW.`is_deleted` = 1 OR NEW.`deleted_at` IS NOT NULL THEN NULL
			ELSE json_object(
				'id', NEW.`id`,
				'title', NEW.`title`,
				'subject', NEW.`subject`,
				'gradeLevel', NEW.`grade_level`,
				'teacherId', NEW.`teacher_id`,
				'contentJson', CASE WHEN NEW.`content_json` IS NULL THEN NULL ELSE json(NEW.`content_json`) END,
				'originalImageUrl', NEW.`original_image_url`,
				'linkedCurriculumIds', CASE WHEN NEW.`linked_curriculum_ids` IS NULL THEN NULL ELSE json(NEW.`linked_curriculum_ids`) END,
				'estimatedDuration', NEW.`estimated_duration`,
				'teacherNotes', NEW.`teacher_notes`,
				'lessonSummary', NEW.`lesson_summary`,
				'flashcards', CASE WHEN NEW.`flashcards` IS NULL THEN NULL ELSE json(NEW.`flashcards`) END,
				'suggestedActivities', CASE WHEN NEW.`suggested_activities` IS NULL THEN NULL ELSE json(NEW.`suggested_activities`) END,
				'isPublished', NEW.`is_published`,
				'lastModified', NEW.`last_modified`,
				'isDeleted', NEW.`is_deleted`,
				'deletedAt', NEW.`deleted_at`,
				'createdAt', NEW.`created_at`,
				'updatedAt', NEW.`updated_at`
			)
		END
	);
END;--> statement-breakpoint

CREATE TRIGGER `sync_lesson_after_delete`
AFTER DELETE ON `lesson`
BEGIN
	INSERT INTO `sync_change` (`scope`, `entity_id`, `operation`, `data_json`)
	VALUES ('lessons', OLD.`id`, 'delete', NULL);
END;
