// ----------------------------------------------------------------------
// Sync engine: bidirectional sync between local SQLite and server D1
// Push: local changes → server, Pull: server changes → local
// ----------------------------------------------------------------------

import type { SQLiteBindValue } from "wa-sqlite";
import { z } from "zod";
import type { Class } from "@/features/classes/classes.schema";
import type { Lesson } from "@/features/lessons/lessons.schema";
import type { User } from "@/features/users/users.schema";
import { execute, query, transaction } from "@/lib/local-db/init";
import type { SyncScope } from "@/types/sync";

type MutableSyncScope = Exclude<SyncScope, "users">;
const conflictRecordJsonSchema = z.record(z.string(), z.unknown());

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

export interface SyncConflictRecord {
	id: string;
	scope: MutableSyncScope;
	entityId: string;
	conflictType: "update-update" | "delete-update";
	localRecord: Record<string, unknown>;
	remoteRecord: Record<string, unknown>;
	createdAt: Date;
}

// Column name maps: local SQLite uses snake_case, Drizzle types use camelCase
const COLUMN_MAP: { [K in SyncScope]: Record<string, string> } = {
	lessons: {
		id: "id",
		title: "title",
		subject: "subject",
		gradeLevel: "grade_level",
		teacherId: "teacher_id",
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
		deletedAt: "deleted_at",
		baseUpdatedAt: "base_updated_at",
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
		deletedAt: "deleted_at",
		baseUpdatedAt: "base_updated_at",
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
	cursor?: string | null,
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

	await transaction(async (exec, qry) => {
		for (const record of records) {
			try {
				const id = typeof record.id === "string" ? record.id : null;
				if (!id) {
					result.errors.push(`Skipped ${scope} record without string id`);
					continue;
				}

				const mutableRecord =
					scope === "lessons" || scope === "classes"
						? {
								...record,
								syncStatus: "synced",
								isDeleted: record.deletedAt
									? true
									: (record.isDeleted ?? false),
								baseUpdatedAt: record.updatedAt,
							}
						: record;
				const snakeRecord = camelToSnake(mutableRecord, colMap);

				if (scope === "lessons" || scope === "classes") {
					const existingRows = await qry<Record<string, unknown>>(
						`SELECT * FROM ${table} WHERE id = ? LIMIT 1;`,
						[id],
					);
					const existing = existingRows[0];

					if (existing && isUnresolvedLocalChange(existing)) {
						await recordConflict(exec, {
							scope,
							entityId: id,
							conflictType: record.deletedAt
								? "delete-update"
								: "update-update",
							localRecord: existing,
							remoteRecord: record,
						});
						result.recordsProcessed++;
						continue;
					}
				}

				const columns = Object.keys(snakeRecord);
				const values = Object.values(snakeRecord).map(serializeValue);
				const placeholders = columns.map(() => "?").join(", ");
				const updateSet = columns
					.flatMap((c) => (c !== "id" ? [`${c} = excluded.${c}`] : []))
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
	if (cursor && result.errors.length === 0) {
		console.info(
			`[Sync:Pull] ${scope} pull complete: ${result.recordsProcessed} processed`,
		);
		await execute(
			`INSERT OR REPLACE INTO _sync_cursors (scope, cursor, synced_at)
       VALUES (?, ?, unixepoch());`,
			[scope, cursor],
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

	await transaction(async (exec, qry) => {
		const existingRows = await qry<Record<string, unknown>>(
			`SELECT sync_status, updated_at, base_updated_at FROM ${table} WHERE id = ? LIMIT 1;`,
			[id],
		);
		const existing = existingRows[0];
		const baseUpdatedAt =
			existing?.sync_status === "pending" ||
			existing?.sync_status === "conflict"
				? existing.base_updated_at
				: existing?.updated_at;

		const snakeData = camelToSnake(
			{
				...data,
				syncStatus: "pending",
				baseUpdatedAt,
				updatedAt: Math.floor(Date.now() / 1000),
			},
			colMap,
		);

		const setClauses = Object.keys(snakeData)
			.map((col) => `${col} = ?`)
			.join(", ");
		const values = [...Object.values(snakeData).map(serializeValue), id];

		await exec(`UPDATE ${table} SET ${setClauses} WHERE id = ?;`, values);
	});
}

/**
 * Soft-delete a record locally, marking it as pending sync.
 */
export async function deleteLocal(scope: SyncScope, id: string): Promise<void> {
	const table = TABLE_MAP[scope];
	await transaction(async (exec, qry) => {
		const existingRows = await qry<Record<string, unknown>>(
			`SELECT sync_status, updated_at, base_updated_at FROM ${table} WHERE id = ? LIMIT 1;`,
			[id],
		);
		const existing = existingRows[0];
		const baseUpdatedAt =
			existing?.sync_status === "pending" ||
			existing?.sync_status === "conflict"
				? existing.base_updated_at
				: existing?.updated_at;

		await exec(
			`UPDATE ${table} SET is_deleted = 1, deleted_at = unixepoch(), sync_status = 'pending', base_updated_at = ?, updated_at = unixepoch() WHERE id = ?;`,
			[serializeValue(baseUpdatedAt), id],
		);
	});
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
	const whereClause =
		scope === "users" ? "id = ?" : "id = ? AND is_deleted = 0";
	const rows = await query<Record<string, unknown>>(
		`SELECT * FROM ${table} WHERE ${whereClause};`,
		[id],
	);

	if (rows.length === 0) return null;
	return snakeToCamel<SyncEntity<typeof scope>>(rows[0], colMap);
}

export async function getLocalExpectedUpdatedAt(
	scope: MutableSyncScope,
	id: string,
): Promise<string | undefined> {
	const table = TABLE_MAP[scope];
	const rows = await query<{
		updated_at?: unknown;
		base_updated_at?: unknown;
	}>(`SELECT updated_at, base_updated_at FROM ${table} WHERE id = ? LIMIT 1;`, [
		id,
	]);
	const row = rows[0];
	if (!row) {
		return undefined;
	}

	return serializeExpectedUpdatedAt(row.base_updated_at ?? row.updated_at);
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

export async function getUnresolvedConflictCount(): Promise<number> {
	const rows = await query<{ count: number }>(
		"SELECT count(*) as count FROM _sync_conflicts WHERE resolved_at IS NULL;",
	);
	return rows[0]?.count ?? 0;
}

export async function getUnresolvedConflicts(): Promise<SyncConflictRecord[]> {
	const rows = await query<{
		id: string;
		scope: string;
		entity_id: string;
		conflict_type: "update-update" | "delete-update";
		local_record: string;
		remote_record: string;
		created_at: number;
	}>(
		`SELECT id, scope, entity_id, conflict_type, local_record, remote_record, created_at
     FROM _sync_conflicts
     WHERE resolved_at IS NULL
     ORDER BY created_at DESC;`,
	);

	return rows.flatMap((row) => {
		if (row.scope !== "lessons" && row.scope !== "classes") {
			return [];
		}

		return [
			{
				id: row.id,
				scope: row.scope,
				entityId: row.entity_id,
				conflictType: row.conflict_type,
				localRecord: parseConflictJson(row.local_record),
				remoteRecord: parseConflictJson(row.remote_record),
				createdAt: new Date(row.created_at * 1000),
			},
		];
	});
}

export async function resolveConflict(
	conflictId: string,
	resolution: "keep-local" | "accept-remote",
): Promise<void> {
	let resolvedScope: MutableSyncScope | null = null;
	let resolvedEntityId: string | null = null;

	await transaction(async (exec, qry) => {
		const rows = await qry<{
			id: string;
			scope: string;
			entity_id: string;
			remote_record: string;
		}>(
			`SELECT id, scope, entity_id, remote_record
       FROM _sync_conflicts
       WHERE id = ? AND resolved_at IS NULL
       LIMIT 1;`,
			[conflictId],
		);
		const conflict = rows[0];
		if (!conflict) return;
		if (conflict.scope !== "lessons" && conflict.scope !== "classes") return;

		resolvedScope = conflict.scope;
		resolvedEntityId = conflict.entity_id;

		if (resolution === "accept-remote") {
			const scope = conflict.scope;
			const remoteRecord = parseConflictJson(conflict.remote_record);
			const table = TABLE_MAP[scope];
			const colMap = COLUMN_MAP[scope];
			const mutableRecord = {
				...remoteRecord,
				syncStatus: "synced",
				isDeleted: remoteRecord.deletedAt
					? true
					: (remoteRecord.isDeleted ?? false),
				baseUpdatedAt: remoteRecord.updatedAt,
			};
			const snakeRecord = camelToSnake(mutableRecord, colMap);
			const columns = Object.keys(snakeRecord);
			const values = Object.values(snakeRecord).map(serializeValue);
			const placeholders = columns.map(() => "?").join(", ");
			const updateSet = columns
				.flatMap((c) => (c !== "id" ? [`${c} = excluded.${c}`] : []))
				.join(", ");

			await exec(
				`INSERT INTO ${table} (${columns.join(", ")})
         VALUES (${placeholders})
         ON CONFLICT(id) DO UPDATE SET ${updateSet};`,
				values,
			);
		} else {
			const table = TABLE_MAP[conflict.scope];
			await exec(`UPDATE ${table} SET sync_status = 'pending' WHERE id = ?;`, [
				conflict.entity_id,
			]);
		}

		await exec(
			"UPDATE _sync_conflicts SET resolved_at = unixepoch() WHERE id = ?;",
			[conflictId],
		);
	});

	if (resolvedScope && resolvedEntityId) {
		const { removeMutationsForEntity } = await import("@/lib/mutation-queue");
		await removeMutationsForEntity(resolvedScope, resolvedEntityId);
	}
}

type ConflictType = "update-update" | "delete-update";

function isUnresolvedLocalChange(row: Record<string, unknown>) {
	return row.sync_status === "pending" || row.sync_status === "conflict";
}

function parseConflictJson(value: string): Record<string, unknown> {
	try {
		return conflictRecordJsonSchema.parse(JSON.parse(value));
	} catch {
		return {};
	}
}

async function recordConflict(
	exec: (sql: string, params?: readonly SQLiteBindValue[]) => Promise<void>,
	{
		scope,
		entityId,
		conflictType,
		localRecord,
		remoteRecord,
	}: {
		scope: MutableSyncScope;
		entityId: string;
		conflictType: ConflictType;
		localRecord: Record<string, unknown>;
		remoteRecord: Record<string, unknown>;
	},
) {
	await exec(
		`INSERT OR REPLACE INTO _sync_conflicts
      (id, scope, entity_id, conflict_type, local_record, remote_record, created_at)
     VALUES (?, ?, ?, ?, ?, ?, unixepoch());`,
		[
			`${scope}:${entityId}`,
			scope,
			entityId,
			conflictType,
			JSON.stringify(localRecord),
			JSON.stringify(remoteRecord),
		],
	);

	const table = TABLE_MAP[scope];
	await exec(`UPDATE ${table} SET sync_status = 'conflict' WHERE id = ?;`, [
		entityId,
	]);
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
				if (/^\d+$/.test(val)) {
					const num = Number.parseInt(val, 10);
					if (num < 100000000000) {
						val = new Date(num * 1000);
					} else {
						val = new Date(num);
					}
				} else {
					const d = new Date(val);
					if (!Number.isNaN(d.getTime())) val = d;
				}
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
	if (value instanceof Date) return Math.floor(value.getTime() / 1000);
	if (typeof value === "object") return JSON.stringify(value);
	if (
		typeof value === "string" ||
		typeof value === "number" ||
		value instanceof Uint8Array
	) {
		return value;
	}
	return String(value);
}

function serializeExpectedUpdatedAt(value: unknown): string | undefined {
	if (value == null) {
		return undefined;
	}

	if (value instanceof Date) {
		return value.toISOString();
	}

	if (typeof value === "number") {
		const millis = value < 100000000000 ? value * 1000 : value;
		const date = new Date(millis);
		return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
	}

	if (typeof value === "string") {
		if (/^\d+$/.test(value)) {
			return serializeExpectedUpdatedAt(Number.parseInt(value, 10));
		}
		const date = new Date(value);
		return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
	}

	return undefined;
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
