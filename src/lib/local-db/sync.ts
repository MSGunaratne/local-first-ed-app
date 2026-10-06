// ----------------------------------------------------------------------
// Sync engine: bidirectional sync between local SQLite and server D1
// Push: local changes → server, Pull: server changes → local
// ----------------------------------------------------------------------

import { uuidv7 } from "uuidv7";
import type { SQLiteBindValue } from "wa-sqlite";
import { z } from "zod";
import type { Class } from "@/features/classes/classes.schema";
import type { Lesson } from "@/features/lessons/lessons.schema";
import type { User } from "@/features/users/users.schema";
import { query, transaction } from "@/lib/local-db/init";
import type { EnqueueMutation } from "@/lib/mutation-queue";
import type { MutationServerFnName, SyncChange, SyncScope } from "@/types/sync";

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
	localUpdatedAt: Date | null;
	remoteUpdatedAt: Date | null;
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
		baseRevision: "base_revision",
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
		baseRevision: "base_revision",
	},
	users: {
		id: "id",
		name: "name",
		updatedAt: "updated_at",
		role: "role",
	},
};

const TABLE_MAP: Record<SyncScope, string> = {
	lessons: "lesson",
	classes: "class",
	users: "user",
};

type LocalTxExec = (
	sql: string,
	params?: readonly SQLiteBindValue[],
) => Promise<void>;
type LocalTxQuery = <T extends Record<string, unknown>>(
	sql: string,
	params?: readonly SQLiteBindValue[],
) => Promise<T[]>;

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
	changes: SyncChange[],
	revision: number,
): Promise<SyncResult> {
	const result: SyncResult = {
		scope,
		direction: "pull",
		recordsProcessed: 0,
		errors: [],
	};

	console.info(
		`[Sync:Pull] Scope: ${scope}, Received ${changes.length} changes`,
	);
	const table = TABLE_MAP[scope];
	const colMap = COLUMN_MAP[scope];

	await transaction(async (exec, qry) => {
		for (const change of changes) {
			const id = change.entityId;
			if (!id) throw new Error(`Received ${scope} change without an entity id`);

			const existingRows =
				scope === "lessons" || scope === "classes"
					? await qry<Record<string, unknown>>(
							`SELECT * FROM ${table} WHERE id = ? LIMIT 1;`,
							[id],
						)
					: [];
			const existing = existingRows[0];

			if (change.operation === "delete") {
				if (existing && isUnresolvedLocalChange(existing)) {
					await recordConflict(exec, {
						scope: scope as MutableSyncScope,
						entityId: id,
						conflictType: "delete-update",
						localRecord: existing,
						remoteRecord: {
							id,
							deletedAt: new Date().toISOString(),
							serverRevision: change.revision,
						},
					});
				} else {
					await exec(`DELETE FROM ${table} WHERE id = ?;`, [id]);
				}
				result.recordsProcessed++;
				continue;
			}

			const record = change.data;
			if (!record)
				throw new Error(`Upsert change ${change.revision} has no data`);

			const mutableRecord =
				scope === "lessons" || scope === "classes"
					? {
							...record,
							syncStatus: "synced",
							isDeleted: record.deletedAt ? true : (record.isDeleted ?? false),
							baseRevision: change.revision,
						}
					: record;
			const snakeRecord = camelToSnake(mutableRecord, colMap);

			if (scope === "lessons" || scope === "classes") {
				if (existing && isUnresolvedLocalChange(existing)) {
					await recordConflict(exec, {
						scope,
						entityId: id,
						conflictType: "update-update",
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
		}

		await exec(
			`INSERT INTO _sync_cursors (scope, revision, synced_at)
       VALUES (?, ?, unixepoch())
       ON CONFLICT(scope) DO UPDATE SET revision = excluded.revision, synced_at = unixepoch();`,
			[scope, revision],
		);
	});

	return result;
}

// Queue-backed writes below are the only push path. The coordinator never scans
// local entity state to infer creates or deletes.

// ----------------------------------------------------------------------
// Local Write Operations
// Used when the app writes offline — marks records as pending sync
// ----------------------------------------------------------------------

async function insertLocalWithTx(
	exec: LocalTxExec,
	scope: SyncScope,
	record: Record<string, unknown>,
) {
	const table = TABLE_MAP[scope];
	const snakeRecord = camelToSnake(
		{ ...record, syncStatus: "pending" },
		COLUMN_MAP[scope],
	);
	const columns = Object.keys(snakeRecord);
	await exec(
		`INSERT INTO ${table} (${columns.join(", ")}) VALUES (${columns
			.map(() => "?")
			.join(", ")});`,
		Object.values(snakeRecord).map(serializeValue),
	);
}

async function updateLocalWithTx(
	exec: LocalTxExec,
	qry: LocalTxQuery,
	scope: MutableSyncScope,
	id: string,
	data: Record<string, unknown>,
) {
	const table = TABLE_MAP[scope];
	const existingRows = await qry<Record<string, unknown>>(
		`SELECT id FROM ${table} WHERE id = ? LIMIT 1;`,
		[id],
	);
	const existing = existingRows[0];
	if (!existing) throw new Error(`Cannot update missing local ${scope}:${id}`);
	const snakeData = camelToSnake(
		{
			...data,
			syncStatus: "pending",
			updatedAt: Math.floor(Date.now() / 1000),
		},
		COLUMN_MAP[scope],
	);
	await exec(
		`UPDATE ${table} SET ${Object.keys(snakeData)
			.map((column) => `${column} = ?`)
			.join(", ")} WHERE id = ?;`,
		[...Object.values(snakeData).map(serializeValue), id],
	);
}

async function deleteLocalWithTx(
	exec: LocalTxExec,
	qry: LocalTxQuery,
	scope: MutableSyncScope,
	id: string,
) {
	const table = TABLE_MAP[scope];
	const rows = await qry<Record<string, unknown>>(
		`SELECT id FROM ${table} WHERE id = ? LIMIT 1;`,
		[id],
	);
	const existing = rows[0];
	if (!existing) return;
	await exec(
		`UPDATE ${table}
     SET is_deleted = 1, deleted_at = unixepoch(), sync_status = 'pending',
		 updated_at = unixepoch()
     WHERE id = ?;`,
		[id],
	);
}

async function commitLocalMutation<K extends MutationServerFnName>(
	mutation: EnqueueMutation<K>,
	localWrite: (exec: LocalTxExec, qry: LocalTxQuery) => Promise<void>,
) {
	let queuedId = mutation.idempotencyKey;
	await transaction(async (exec, qry) => {
		await localWrite(exec, qry);
		const { enqueueUsingTransaction } = await import("@/lib/mutation-queue");
		const queued = await enqueueUsingTransaction(mutation, exec, qry);
		queuedId = queued.id;
	});
	const { flushIfOnline } = await import("@/lib/mutation-queue");
	await flushIfOnline();
	return queuedId;
}

export function insertLocalAndEnqueue<K extends MutationServerFnName>(
	scope: MutableSyncScope,
	record: Record<string, unknown>,
	mutation: EnqueueMutation<K>,
) {
	return commitLocalMutation(mutation, (exec) =>
		insertLocalWithTx(exec, scope, record),
	);
}

export function updateLocalAndEnqueue<K extends MutationServerFnName>(
	scope: MutableSyncScope,
	id: string,
	data: Record<string, unknown>,
	mutation: EnqueueMutation<K>,
) {
	return commitLocalMutation(mutation, (exec, qry) =>
		updateLocalWithTx(exec, qry, scope, id, data),
	);
}

export function deleteLocalAndEnqueue<K extends MutationServerFnName>(
	scope: MutableSyncScope,
	id: string,
	mutation: EnqueueMutation<K>,
) {
	return commitLocalMutation(mutation, (exec, qry) =>
		deleteLocalWithTx(exec, qry, scope, id),
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
	const whereClause =
		scope === "users" ? "id = ?" : "id = ? AND is_deleted = 0";
	const rows = await query<Record<string, unknown>>(
		`SELECT * FROM ${table} WHERE ${whereClause};`,
		[id],
	);

	if (rows.length === 0) return null;
	return snakeToCamel<SyncEntity<typeof scope>>(rows[0], colMap);
}

export async function getLocalExpectedRevision(
	scope: MutableSyncScope,
	id: string,
): Promise<number | undefined> {
	const table = TABLE_MAP[scope];
	const rows = await query<{ base_revision?: number }>(
		`SELECT base_revision FROM ${table} WHERE id = ? LIMIT 1;`,
		[id],
	);
	const row = rows[0];
	return row ? Number(row.base_revision ?? 0) : undefined;
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

export async function getSyncCursor(scope: SyncScope): Promise<number> {
	const rows = await query<{ revision: number }>(
		"SELECT revision FROM _sync_cursors WHERE scope = ?;",
		[scope],
	);
	return Number(rows[0]?.revision ?? 0);
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
		local_updated_at: number | null;
		remote_updated_at: number | null;
	}>(
		`SELECT id, scope, entity_id, conflict_type, local_record, remote_record,
            created_at, local_updated_at, remote_updated_at
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
				localUpdatedAt: row.local_updated_at
					? new Date(row.local_updated_at * 1000)
					: null,
				remoteUpdatedAt: row.remote_updated_at
					? new Date(row.remote_updated_at * 1000)
					: null,
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
			conflict_type: "update-update" | "delete-update";
			local_record: string;
			remote_record: string;
		}>(
			`SELECT id, scope, entity_id, conflict_type, local_record, remote_record
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
			if (conflict.conflict_type === "delete-update") {
				await exec(`DELETE FROM ${table} WHERE id = ?;`, [conflict.entity_id]);
				await exec("DELETE FROM _outbox WHERE scope = ? AND entity_id = ?;", [
					scope,
					conflict.entity_id,
				]);
			} else {
				const mutableRecord = {
					...remoteRecord,
					syncStatus: "synced",
					isDeleted: remoteRecord.deletedAt
						? true
						: (remoteRecord.isDeleted ?? false),
					baseRevision: remoteRecord.serverRevision,
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
				await exec("DELETE FROM _outbox WHERE scope = ? AND entity_id = ?;", [
					scope,
					conflict.entity_id,
				]);
			}
		} else {
			const table = TABLE_MAP[conflict.scope];
			const remoteRecord = parseConflictJson(conflict.remote_record);
			const serverRevision =
				typeof remoteRecord.serverRevision === "number"
					? remoteRecord.serverRevision
					: 0;
			await exec(
				`UPDATE ${table} SET sync_status = 'pending', base_revision = ? WHERE id = ?;`,
				[serverRevision, conflict.entity_id],
			);

			if (conflict.conflict_type === "delete-update") {
				await exec("DELETE FROM _outbox WHERE scope = ? AND entity_id = ?;", [
					conflict.scope,
					conflict.entity_id,
				]);
				const local = snakeToCamel<Record<string, unknown>>(
					parseConflictJson(conflict.local_record),
					COLUMN_MAP[conflict.scope],
				);
				const idempotencyKey = uuidv7();
				const { enqueueUsingTransaction } = await import(
					"@/lib/mutation-queue"
				);
				await enqueueUsingTransaction(
					{
						scope: conflict.scope,
						type: "update",
						serverFn:
							conflict.scope === "lessons" ? "restoreLesson" : "restoreClass",
						payload: {
							id: conflict.entity_id,
							data: local,
							expectedRevision: serverRevision,
							idempotencyKey,
						},
						idempotencyKey,
					},
					exec,
					qry,
				);
			} else {
				const queued = await qry<{ id: string; payload_json: string }>(
					"SELECT id, payload_json FROM _outbox WHERE scope = ? AND entity_id = ?;",
					[conflict.scope, conflict.entity_id],
				);
				for (const mutation of queued) {
					const payload = parseConflictJson(mutation.payload_json);
					await exec(
						`UPDATE _outbox SET payload_json = ?, status = 'pending',
             next_attempt_at = ?, error_kind = NULL, last_error = NULL
             WHERE id = ?;`,
						[
							JSON.stringify({ ...payload, expectedRevision: serverRevision }),
							Date.now(),
							mutation.id,
						],
					);
				}
			}
		}

		await exec(
			"UPDATE _sync_conflicts SET resolved_at = unixepoch() WHERE id = ?;",
			[conflictId],
		);
	});

	if (resolution === "keep-local" && resolvedScope && resolvedEntityId) {
		const { flushIfOnline } = await import("@/lib/mutation-queue");
		await flushIfOnline();
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
      (id, scope, entity_id, conflict_type, local_record, remote_record, created_at,
       local_updated_at, remote_updated_at)
     VALUES (?, ?, ?, ?, ?, ?, unixepoch(), ?, ?);`,
		[
			`${scope}:${entityId}`,
			scope,
			entityId,
			conflictType,
			JSON.stringify(localRecord),
			JSON.stringify(remoteRecord),
			serializeValue(localRecord.updated_at ?? localRecord.updatedAt),
			serializeValue(remoteRecord.updatedAt),
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
			camelKey.startsWith("is") &&
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
