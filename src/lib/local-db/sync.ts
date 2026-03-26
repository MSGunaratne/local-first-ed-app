// ----------------------------------------------------------------------
// Sync engine: bidirectional sync between local SQLite and server D1
// Push: local changes → server, Pull: server changes → local
// ----------------------------------------------------------------------

import type { SQLiteBindValue } from "wa-sqlite";
import type { Class } from "@/features/classes/classes.schema";
import type { Lesson } from "@/features/lessons/lessons.schema";
import type { User } from "@/features/users/users.schema";
import { execute, query, transaction } from "@/lib/local-db/init";

export type SyncScope = "lessons" | "classes" | "users";
type MutableSyncScope = Exclude<SyncScope, "users">;

type SyncEntityMap = {
	lessons: Lesson;
	classes: Class;
	users: User;
};

export type SyncEntity<S extends SyncScope> = SyncEntityMap[S] &
	Record<string, unknown>;

export type MutableSyncEntity<S extends MutableSyncScope> = SyncEntity<S>;

export type SyncDirection = "push" | "pull";

export interface SyncResult {
	scope: SyncScope;
	direction: SyncDirection;
	recordsProcessed: number;
	errors: string[];
}

// Column name maps: local SQLite uses snake_case, Drizzle types use camelCase
const COLUMN_MAP: { [K in SyncScope]: Record<string, string> } = {
	lessons: {
		id: "id",
		title: "title",
		subject: "subject",
		gradeLevel: "grade_level",
		contentJson: "content_json",
		contentHtml: "content_html",
		originalImageUrl: "original_image_url",
		linkedCurriculumIds: "linked_curriculum_ids",
		estimatedDuration: "estimated_duration",
		teacherNotes: "teacher_notes",
		lessonSummary: "lesson_summary",
		flashcards: "flashcards",
		suggestedActivities: "suggested_activities",
		isPublished: "is_published",
		lastModified: "last_modified",
		syncStatus: "sync_status",
		isDeleted: "is_deleted",
		createdAt: "created_at",
		updatedAt: "updated_at",
	},
	classes: {
		id: "id",
		name: "name",
		subject: "subject",
		teacherId: "teacher_id",
		gradeLevel: "grade_level",
		createdAt: "created_at",
		updatedAt: "updated_at",
		syncStatus: "sync_status",
		isDeleted: "is_deleted",
	},
	users: {
		id: "id",
		name: "name",
		email: "email",
		emailVerified: "email_verified",
		image: "image",
		phoneNumber: "phone_number",
		createdAt: "created_at",
		updatedAt: "updated_at",
		role: "role",
		banned: "banned",
		banReason: "ban_reason",
		banExpires: "ban_expires",
	},
};

const TABLE_MAP: Record<SyncScope, string> = {
	lessons: "lesson",
	classes: "class",
	users: "user",
};

// ----------------------------------------------------------------------
// Pull: server → local
// Upserts server records into the local database
// ----------------------------------------------------------------------

/**
 * Pull server data into the local database.
 * Accepts an array of server records (camelCase keys) and upserts them.
 */
export async function pullRecords(
	scope: SyncScope,
	records: Array<Record<string, unknown>>,
): Promise<SyncResult> {
	const result: SyncResult = {
		scope,
		direction: "pull",
		recordsProcessed: 0,
		errors: [],
	};

	console.info(
		`[Sync:Pull] Scope: ${scope}, Received ${records.length} records`,
	);
	const table = TABLE_MAP[scope];
	const colMap = COLUMN_MAP[scope];

	await transaction(async (exec) => {
		for (const record of records) {
			try {
				const snakeRecord = camelToSnake(record, colMap);
				const columns = Object.keys(snakeRecord);
				const values = Object.values(snakeRecord).map(serializeValue);
				const placeholders = columns.map(() => "?").join(", ");
				const updateSet = columns
					.filter((c) => c !== "id")
					.map((c) => `${c} = excluded.${c}`)
					.join(", ");

				const sql = `INSERT INTO ${table} (${columns.join(", ")})
          VALUES (${placeholders})
          ON CONFLICT(id) DO UPDATE SET ${updateSet};`;

				await exec(sql, values);
				result.recordsProcessed++;
			} catch (error) {
				console.error(`[Sync:Pull] Failed to upsert ${scope}:`, error);
				result.errors.push(
					`Failed to upsert ${scope} record: ${error instanceof Error ? error.message : String(error)}`,
				);
			}
		}
	});

	// Update sync cursor
	if (result.recordsProcessed > 0) {
		console.info(
			`[Sync:Pull] ${scope} pull complete: ${result.recordsProcessed} processed`,
		);
		await execute(
			`INSERT OR REPLACE INTO _sync_cursors (scope, cursor, synced_at)
       VALUES (?, ?, unixepoch());`,
			[scope, new Date().toISOString()],
		);
	}

	return result;
}

// ----------------------------------------------------------------------
// Push: local → server
// Returns records that need to be synced to the server
// ----------------------------------------------------------------------

/**
 * Get all locally modified records that need to be pushed to the server.
 * Returns records with sync_status = 'pending'.
 */
export async function getPendingPushRecords(
	scope: MutableSyncScope,
): Promise<Array<MutableSyncEntity<typeof scope>>> {
	const table = TABLE_MAP[scope];
	const colMap = COLUMN_MAP[scope];

	const rows = await query<Record<string, unknown>>(
		`SELECT * FROM ${table} WHERE sync_status = 'pending' AND is_deleted = 0;`,
	);

	return rows.map((row) =>
		snakeToCamel<MutableSyncEntity<typeof scope>>(row, colMap),
	);
}

/**
 * Get locally soft-deleted records that need to be synced.
 */
export async function getPendingDeleteRecords(
	scope: MutableSyncScope,
): Promise<string[]> {
	const table = TABLE_MAP[scope];
	const rows = await query<{ id: string }>(
		`SELECT id FROM ${table} WHERE is_deleted = 1 AND sync_status = 'pending';`,
	);

	return rows.map((row) => row.id);
}

/**
 * Mark records as synced after successful push to server.
 */
export async function markSynced(
	scope: SyncScope,
	ids: string[],
): Promise<void> {
	if (ids.length === 0) return;

	const table = TABLE_MAP[scope];
	const placeholders = ids.map(() => "?").join(", ");
	await execute(
		`UPDATE ${table} SET sync_status = 'synced' WHERE id IN (${placeholders});`,
		ids,
	);
}

/**
 * Permanently remove soft-deleted records after server confirms deletion.
 */
export async function purgeSynced(
	scope: SyncScope,
	ids: string[],
): Promise<void> {
	if (ids.length === 0) return;

	const table = TABLE_MAP[scope];
	const placeholders = ids.map(() => "?").join(", ");
	await execute(`DELETE FROM ${table} WHERE id IN (${placeholders});`, ids);
}

// ----------------------------------------------------------------------
// Local Write Operations
// Used when the app writes offline — marks records as pending sync
// ----------------------------------------------------------------------

/**
 * Insert a record locally, marking it as pending sync.
 */
export async function insertLocal(
	scope: SyncScope,
	record: Record<string, unknown>,
): Promise<void> {
	console.info(
		`[LocalWrite:${scope}] Inserting record...`,
		record.id || "no-id",
	);
	const table = TABLE_MAP[scope];
	const colMap = COLUMN_MAP[scope];
	const snakeRecord = camelToSnake(
		{ ...record, syncStatus: "pending" },
		colMap,
	);

	const columns = Object.keys(snakeRecord);
	const values = Object.values(snakeRecord).map(serializeValue);
	const placeholders = columns.map(() => "?").join(", ");

	await execute(
		`INSERT INTO ${table} (${columns.join(", ")}) VALUES (${placeholders});`,
		values,
	);
	console.info(`[LocalWrite:${scope}] Done.`);
}

/**
 * Update a record locally, marking it as pending sync.
 */
export async function updateLocal(
	scope: SyncScope,
	id: string,
	data: Record<string, unknown>,
): Promise<void> {
	const table = TABLE_MAP[scope];
	const colMap = COLUMN_MAP[scope];
	const snakeData = camelToSnake(
		{
			...data,
			syncStatus: "pending",
			updatedAt: Math.floor(Date.now() / 1000),
		},
		colMap,
	);

	const setClauses = Object.keys(snakeData)
		.map((col) => `${col} = ?`)
		.join(", ");
	const values = [...Object.values(snakeData).map(serializeValue), id];

	await execute(`UPDATE ${table} SET ${setClauses} WHERE id = ?;`, values);
}

/**
 * Soft-delete a record locally, marking it as pending sync.
 */
export async function deleteLocal(scope: SyncScope, id: string): Promise<void> {
	const table = TABLE_MAP[scope];
	await execute(
		`UPDATE ${table} SET is_deleted = 1, sync_status = 'pending', updated_at = unixepoch() WHERE id = ?;`,
		[id],
	);
}

/**
 * Read a single record by ID from the local database.
 */
export async function getLocalById(
	scope: SyncScope,
	id: string,
): Promise<SyncEntity<typeof scope> | null> {
	const table = TABLE_MAP[scope];
	const colMap = COLUMN_MAP[scope];
	const rows = await query<Record<string, unknown>>(
		`SELECT * FROM ${table} WHERE id = ? AND is_deleted = 0;`,
		[id],
	);

	if (rows.length === 0) return null;
	return snakeToCamel<SyncEntity<typeof scope>>(rows[0], colMap);
}

/**
 * Read all non-deleted records from a scope.
 */
export async function getLocalAll(
	scope: SyncScope,
): Promise<Array<SyncEntity<typeof scope>>> {
	const table = TABLE_MAP[scope];
	const colMap = COLUMN_MAP[scope];

	const whereClause = scope === "users" ? "" : "WHERE is_deleted = 0";

	const rows = await query<Record<string, unknown>>(
		`SELECT * FROM ${table} ${whereClause} ORDER BY updated_at DESC;`,
	);

	return rows.map((row) => snakeToCamel<SyncEntity<typeof scope>>(row, colMap));
}

// ----------------------------------------------------------------------
// Sync cursor helpers
// ----------------------------------------------------------------------

export async function getSyncCursor(scope: SyncScope): Promise<string | null> {
	const rows = await query<{ cursor: string }>(
		"SELECT cursor FROM _sync_cursors WHERE scope = ?;",
		[scope],
	);
	return rows[0]?.cursor ?? null;
}

// ----------------------------------------------------------------------
// Utility: camelCase ↔ snake_case conversion using column maps
// ----------------------------------------------------------------------

function camelToSnake(
	obj: Record<string, unknown>,
	colMap: Record<string, string>,
): Record<string, unknown> {
	const result: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(obj)) {
		const snakeKey = colMap[key];
		if (snakeKey) {
			result[snakeKey] = value;
		}
	}
	return result;
}

function snakeToCamel<T extends Record<string, unknown>>(
	obj: Record<string, unknown>,
	colMap: Record<string, string>,
): T {
	// Invert the column map: snake → camel
	const inverseMap: Record<string, string> = {};
	for (const [camel, snake] of Object.entries(colMap)) {
		inverseMap[snake] = camel;
	}

	const result: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(obj)) {
		const camelKey = inverseMap[key] ?? key;
		let val = deserializeValue(value);

		// Hydrate dates: SQLite stores 'INTEGER' as seconds, or 'TEXT' as ISO strings
		if (
			(camelKey.endsWith("At") ||
				camelKey.endsWith("Expires") ||
				camelKey === "lastModified") &&
			val != null
		) {
			if (typeof val === "number") {
				// We assume numbers are unix seconds if they are below 10^11
				// JS milliseconds are typically > 10^12 for modern dates
				if (val < 100000000000) {
					val = new Date(val * 1000);
				} else {
					val = new Date(val);
				}
			} else if (typeof val === "string") {
				const d = new Date(val);
				if (!Number.isNaN(d.getTime())) val = d;
			}
		}

		// Hydrate booleans: SQLite stores boolean mode as 0/1
		if (
			(camelKey.startsWith("is") ||
				camelKey === "emailVerified" ||
				camelKey === "banned") &&
			typeof val === "number" &&
			(val === 0 || val === 1)
		) {
			val = val === 1;
		}

		result[camelKey] = val;
	}
	return result as T;
}

function serializeValue(value: unknown): SQLiteBindValue {
	if (value === null || value === undefined) return null;
	if (typeof value === "boolean") return value ? 1 : 0;
	if (typeof value === "object") return JSON.stringify(value);
	if (value instanceof Date) return Math.floor(value.getTime() / 1000);
	if (
		typeof value === "string" ||
		typeof value === "number" ||
		value instanceof Uint8Array
	) {
		return value;
	}
	return String(value);
}

function deserializeValue(value: unknown): unknown {
	// SQLite returns integers for booleans
	if (typeof value === "number") return value;
	if (typeof value === "string") {
		// Try to parse JSON strings back to objects
		if (
			(value.startsWith("{") && value.endsWith("}")) ||
			(value.startsWith("[") && value.endsWith("]"))
		) {
			try {
				return JSON.parse(value);
			} catch {
				return value;
			}
		}
		return value;
	}
	return value;
}
