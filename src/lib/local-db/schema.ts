// ----------------------------------------------------------------------
// Local SQLite schema
// Mirrors the server-side D1 schema for offline data access.
// Tables are created with IF NOT EXISTS for safe re-initialization.
// ----------------------------------------------------------------------

import type { SQLiteAPI } from "wa-sqlite";
import { execWithParams } from "@/lib/local-db/init";

const SCHEMA_VERSION = 1;

/**
 * Run schema migrations on the local SQLite database.
 * Uses a simple version-based approach with a `_meta` table.
 */
export async function migrateSchema(
	sqlite3: SQLiteAPI,
	db: number | null,
): Promise<void> {
	if (!db) return;

	// Create meta table if it doesn't exist
	await sqlite3.exec(
		db,
		`CREATE TABLE IF NOT EXISTS _meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );`,
	);

	// Check current version
	const rows: string[] = [];
	await execWithParams(
		sqlite3,
		db,
		"SELECT value FROM _meta WHERE key = 'schema_version';",
		undefined,
		(row: readonly unknown[]) => {
			const value = row[0];
			if (typeof value === "string") {
				rows.push(value);
			}
		},
	);

	const currentVersion = rows.length > 0 ? Number.parseInt(rows[0], 10) : 0;

	await applyV1(sqlite3, db);
	// Update schema version
	await execWithParams(
		sqlite3,
		db,
		`INSERT OR REPLACE INTO _meta (key, value)
     VALUES ('schema_version', ?);`,
		[String(SCHEMA_VERSION)],
	);

	console.info(
		`[LocalDB] Schema migrated from v${currentVersion} to v${SCHEMA_VERSION}`,
	);
}

// ----------------------------------------------------------------------
// V1: Initial tables — mirrors D1 schema
// ----------------------------------------------------------------------

async function applyV1(sqlite3: SQLiteAPI, db: number): Promise<void> {
	await sqlite3.exec(
		db,
		`
    -- Users (read-only local cache of server users)
    CREATE TABLE IF NOT EXISTS user (
      id                TEXT PRIMARY KEY,
      name              TEXT NOT NULL,
      email             TEXT NOT NULL UNIQUE,
      email_verified    INTEGER NOT NULL DEFAULT 0,
      image             TEXT,
      phone_number      TEXT UNIQUE,
      created_at        INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at        INTEGER NOT NULL DEFAULT (unixepoch()),
      role              TEXT NOT NULL,
      banned            INTEGER DEFAULT 0,
      ban_reason        TEXT,
      ban_expires       INTEGER
    );

    -- Classes
    CREATE TABLE IF NOT EXISTS class (
      id                TEXT PRIMARY KEY,
      name              TEXT NOT NULL,
      subject           TEXT NOT NULL,
      teacher_id        TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
      grade_level       INTEGER NOT NULL,
      created_at        INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at        INTEGER NOT NULL DEFAULT (unixepoch()),
      deleted_at        INTEGER,
      base_updated_at   INTEGER,
      -- sync fields
      sync_status       TEXT NOT NULL DEFAULT 'synced',
      is_deleted        INTEGER NOT NULL DEFAULT 0
    );

    -- Lessons
    CREATE TABLE IF NOT EXISTS lesson (
      id                    TEXT PRIMARY KEY,
      title                 TEXT NOT NULL,
      subject               TEXT NOT NULL,
      grade_level           INTEGER NOT NULL,
      teacher_id            TEXT REFERENCES user(id) ON DELETE SET NULL,
      content_json          TEXT,
      content_html          TEXT,
      original_image_url    TEXT,
      linked_curriculum_ids TEXT,
      estimated_duration    INTEGER,
      teacher_notes         TEXT,
      lesson_summary        TEXT,
      flashcards            TEXT,
      suggested_activities  TEXT,
      is_published          INTEGER NOT NULL DEFAULT 0,
      last_modified         INTEGER NOT NULL DEFAULT (unixepoch()),
      sync_status           TEXT NOT NULL DEFAULT 'synced',
      is_deleted            INTEGER NOT NULL DEFAULT 0,
      deleted_at            INTEGER,
      base_updated_at       INTEGER,
      created_at            INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at            INTEGER NOT NULL DEFAULT (unixepoch())
    );

    -- Student profiles
    CREATE TABLE IF NOT EXISTS student_profile (
      id            TEXT PRIMARY KEY,
      user_id       TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
      grade_level   INTEGER NOT NULL,
      created_at    INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at    INTEGER NOT NULL DEFAULT (unixepoch())
    );

    -- Enrollments (junction table)
    CREATE TABLE IF NOT EXISTS enrollment (
      class_id      TEXT NOT NULL REFERENCES class(id) ON DELETE CASCADE,
      student_id    TEXT NOT NULL REFERENCES student_profile(id) ON DELETE CASCADE,
      joined_at     INTEGER NOT NULL DEFAULT (unixepoch()),
      PRIMARY KEY (class_id, student_id)
    );

    -- Assessments
    CREATE TABLE IF NOT EXISTS assessment (
      id              TEXT PRIMARY KEY,
      lesson_id       TEXT NOT NULL REFERENCES lesson(id) ON DELETE CASCADE,
      question_text   TEXT NOT NULL,
      question_type   TEXT NOT NULL,
      correct_answer  TEXT,
      created_at      INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at      INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS student_progress_event (
      id                  TEXT PRIMARY KEY,
      lesson_id           TEXT NOT NULL,
      progress_status     TEXT NOT NULL,
      idempotency_key     TEXT NOT NULL UNIQUE,
      occurred_at         INTEGER NOT NULL DEFAULT (unixepoch()),
      sync_status         TEXT NOT NULL DEFAULT 'pending'
    );

    -- Sync cursor tracking
    CREATE TABLE IF NOT EXISTS _sync_cursors (
      scope       TEXT PRIMARY KEY,
      cursor      TEXT NOT NULL,
      synced_at   INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS _sync_conflicts (
      id              TEXT PRIMARY KEY,
      scope           TEXT NOT NULL,
      entity_id       TEXT NOT NULL,
      conflict_type   TEXT NOT NULL,
      base_record     TEXT,
      local_record    TEXT NOT NULL,
      remote_record   TEXT NOT NULL,
      created_at      INTEGER NOT NULL DEFAULT (unixepoch()),
      resolved_at     INTEGER
    );

    CREATE TABLE IF NOT EXISTS _outbox (
      id                TEXT PRIMARY KEY,
      scope             TEXT NOT NULL,
      mutation_type     TEXT NOT NULL,
      server_fn         TEXT NOT NULL,
      payload_json      TEXT NOT NULL,
      idempotency_key   TEXT NOT NULL,
      status            TEXT NOT NULL DEFAULT 'pending',
      created_at        INTEGER NOT NULL,
      retry_count       INTEGER NOT NULL DEFAULT 0,
      last_error        TEXT
    );

    -- Indexes for common queries
    CREATE INDEX IF NOT EXISTS idx_lesson_subject ON lesson(subject);
    CREATE INDEX IF NOT EXISTS idx_lesson_teacher ON lesson(teacher_id);
    CREATE INDEX IF NOT EXISTS idx_lesson_sync_status ON lesson(sync_status);
    CREATE INDEX IF NOT EXISTS idx_class_teacher ON class(teacher_id);
    CREATE INDEX IF NOT EXISTS idx_class_sync_status ON class(sync_status);
    CREATE INDEX IF NOT EXISTS idx_user_role ON user(role);
    CREATE INDEX IF NOT EXISTS idx_sync_conflicts_scope_entity ON _sync_conflicts(scope, entity_id);
    CREATE INDEX IF NOT EXISTS idx_outbox_status_created ON _outbox(status, created_at);
    CREATE INDEX IF NOT EXISTS idx_outbox_scope_created ON _outbox(scope, created_at);
    CREATE INDEX IF NOT EXISTS idx_student_progress_lesson ON student_progress_event(lesson_id);
    CREATE INDEX IF NOT EXISTS idx_student_progress_sync_status ON student_progress_event(sync_status);
  `,
	);
}
