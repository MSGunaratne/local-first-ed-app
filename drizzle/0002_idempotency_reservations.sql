CREATE TABLE IF NOT EXISTS `idempotency_keys` (
	`key` text PRIMARY KEY NOT NULL,
	`request_hash` text NOT NULL,
	`status` text NOT NULL CHECK (`status` IN ('in_progress', 'completed')),
	`response_body` text,
	`created_at` integer NOT NULL DEFAULT (unixepoch()),
	`updated_at` integer NOT NULL DEFAULT (unixepoch())
);--> statement-breakpoint
CREATE INDEX `idx_idempotency_keys_created_at`
	ON `idempotency_keys` (`created_at`);
