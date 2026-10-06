import { uuidv7 } from "uuidv7";
import type { SQLiteBindValue } from "wa-sqlite";
import { ValidationError } from "#/db/utils/errors";
import { execute, query, transaction } from "@/lib/local-db/init";
import {
	decryptPayloadJson,
	encryptPayloadJson,
} from "@/lib/local-payload-encryption";
import {
	type MutationServerFnPayloadMap,
	mutationPayloadSchemas,
	type OutboxRow,
	outboxRowSchema,
	type QueuedMutation,
	queuedMutationSchema,
} from "@/lib/mutation-queue.schema";
import type {
	MutationErrorKind,
	MutationScope,
	MutationServerFnName,
	MutationType,
} from "@/types/sync";

export type {
	MutationServerFnPayloadMap,
	QueuedMutation,
} from "./mutation-queue.schema";

const LEASE_DURATION_MS = 30_000;
const LEASE_RENEW_INTERVAL_MS = 10_000;
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_BACKOFF_MS = 5 * 60_000;
const TAB_OWNER_ID = uuidv7();

type SQLParams = readonly SQLiteBindValue[];
type TxExec = (sql: string, params?: SQLParams) => Promise<void>;
type TxQuery = <T extends Record<string, unknown>>(
	sql: string,
	params?: SQLParams,
) => Promise<T[]>;

export type EnqueueMutation<K extends MutationServerFnName> = {
	scope: MutationScope;
	type: MutationType;
	serverFn: K;
	payload: MutationServerFnPayloadMap[K];
	idempotencyKey: string;
};

interface EnqueueResult {
	id: string;
	cancelledCreate: boolean;
}

interface ClassifiedError {
	kind: MutationErrorKind;
	status: "pending" | "blocked" | "conflict";
	message: string;
	remoteRecord: Record<string, unknown> | null;
}

const serverFnRegistry = new Map<
	MutationServerFnName,
	(payload: unknown, signal: AbortSignal) => Promise<unknown>
>();
let registryBootstrapped = false;
let outboxSchemaPromise: Promise<void> | null = null;
let flushInFlight: Promise<FlushResult> | null = null;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function getStringField(record: Record<string, unknown>, field: string) {
	const value = record[field];
	return typeof value === "string" && value.length > 0 ? value : null;
}

export function getMutationEntityId(
	mutation: Pick<QueuedMutation, "serverFn" | "payload">,
): string | null {
	if (!isRecord(mutation.payload)) return null;
	switch (mutation.serverFn) {
		case "createLesson":
		case "updateLesson":
		case "deleteLesson":
		case "createClass":
		case "updateClass":
		case "deleteClass":
		case "updateUser":
		case "deleteUser":
			return getStringField(mutation.payload, "id");
		default:
			return null;
	}
}

function isUserMutation(mutation: EnqueueMutation<MutationServerFnName>) {
	return mutation.scope === "users" || mutation.serverFn.endsWith("User");
}

function shouldEncryptPayload(serverFn: MutationServerFnName) {
	return (
		serverFn === "submitLessonFeedback" ||
		serverFn === "submitStudentProgressEvent"
	);
}

async function serializePayload(
	serverFn: MutationServerFnName,
	payload: unknown,
) {
	return shouldEncryptPayload(serverFn)
		? encryptPayloadJson(payload)
		: JSON.stringify(payload);
}

function mergePayloads(
	previous: QueuedMutation,
	next: EnqueueMutation<MutationServerFnName>,
): {
	type: MutationType;
	serverFn: MutationServerFnName;
	payload: unknown;
} | null {
	if (!isRecord(previous.payload) || !isRecord(next.payload)) return null;
	const nextPayload = next.payload as Record<string, unknown>;

	if (previous.type === "create" && next.type === "update") {
		const updates = isRecord(nextPayload.data) ? nextPayload.data : {};
		return {
			type: "create",
			serverFn: previous.serverFn,
			payload: {
				...previous.payload,
				...updates,
				id: previous.entityId,
				idempotencyKey: previous.idempotencyKey,
			},
		};
	}

	if (previous.type === "update" && next.type === "update") {
		const previousData = isRecord(previous.payload.data)
			? previous.payload.data
			: {};
		const nextData = isRecord(nextPayload.data) ? nextPayload.data : {};
		return {
			type: "update",
			serverFn: previous.serverFn,
			payload: {
				...previous.payload,
				data: { ...previousData, ...nextData },
				idempotencyKey: previous.idempotencyKey,
			},
		};
	}

	if (previous.type === "update" && next.type === "delete") {
		return { type: "delete", serverFn: next.serverFn, payload: next.payload };
	}

	return null;
}

async function outboxRowToMutation(
	row: OutboxRow,
): Promise<QueuedMutation | null> {
	let payload: unknown;
	try {
		payload = await decryptPayloadJson(row.payload_json);
	} catch (error) {
		const message =
			error instanceof Error
				? `Queued change could not be decrypted: ${error.message}`
				: "Queued change could not be decrypted";
		await execute(
			"UPDATE _outbox SET status = 'corrupt', error_kind = 'unknown', last_error = ? WHERE id = ?;",
			[message, row.id],
		);
		return {
			id: row.id,
			scope: row.scope,
			type: row.mutation_type,
			serverFn: row.server_fn,
			payload: {},
			idempotencyKey: row.idempotency_key,
			status: "corrupt",
			entityId: row.entity_id,
			createdAt: row.created_at,
			sequence: row.sequence,
			retryCount: row.retry_count,
			nextAttemptAt: row.next_attempt_at,
			leaseOwner: null,
			leaseExpiresAt: null,
			errorKind: "unknown",
			lastError: message,
			remoteRecord: null,
		};
	}

	let remoteRecord: Record<string, unknown> | null = null;
	if (row.remote_record_json) {
		try {
			const parsed = JSON.parse(row.remote_record_json);
			remoteRecord = isRecord(parsed) ? parsed : null;
		} catch {
			remoteRecord = null;
		}
	}

	const candidate = {
		id: row.id,
		scope: row.scope,
		type: row.mutation_type,
		serverFn: row.server_fn,
		payload,
		idempotencyKey: row.idempotency_key,
		status: row.status,
		entityId: row.entity_id,
		createdAt: row.created_at,
		sequence: row.sequence,
		retryCount: row.retry_count,
		nextAttemptAt: row.next_attempt_at,
		leaseOwner: row.lease_owner,
		leaseExpiresAt: row.lease_expires_at,
		errorKind: row.error_kind,
		lastError: row.last_error ?? undefined,
		remoteRecord,
	};
	const parsed = queuedMutationSchema.safeParse(candidate);
	return parsed.success ? parsed.data : null;
}

async function decodeRawRow(raw: Record<string, unknown>) {
	const parsed = outboxRowSchema.safeParse(raw);
	if (parsed.success) return outboxRowToMutation(parsed.data);
	if (typeof raw.id === "string") {
		await execute(
			"UPDATE _outbox SET status = 'corrupt', error_kind = 'unknown', last_error = ? WHERE id = ?;",
			["Queued change has an unsupported or malformed shape", raw.id],
		);
	}
	return null;
}

async function ensureOutboxSchema() {
	outboxSchemaPromise ??= (async () => {
		await execute(`
      CREATE TABLE IF NOT EXISTS _outbox (
        id TEXT PRIMARY KEY,
        scope TEXT NOT NULL,
        mutation_type TEXT NOT NULL,
        server_fn TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        idempotency_key TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        entity_id TEXT,
        created_at INTEGER NOT NULL,
        sequence INTEGER NOT NULL,
        retry_count INTEGER NOT NULL DEFAULT 0,
        next_attempt_at INTEGER NOT NULL,
        lease_owner TEXT,
        lease_expires_at INTEGER,
        error_kind TEXT,
        last_error TEXT,
        remote_record_json TEXT
      );
    `);
		await execute(
			"CREATE INDEX IF NOT EXISTS idx_outbox_status_attempt ON _outbox(status, next_attempt_at, sequence);",
		);
		await execute(
			"CREATE INDEX IF NOT EXISTS idx_outbox_entity_sequence ON _outbox(scope, entity_id, sequence);",
		);
	})();

	try {
		await outboxSchemaPromise;
	} catch (error) {
		outboxSchemaPromise = null;
		throw error;
	}
}

export async function enqueueUsingTransaction<K extends MutationServerFnName>(
	mutation: EnqueueMutation<K>,
	exec: TxExec,
	qry: TxQuery,
): Promise<EnqueueResult> {
	if (isUserMutation(mutation as EnqueueMutation<MutationServerFnName>)) {
		throw new Error(
			"User account changes require an active network connection.",
		);
	}

	const now = Date.now();
	const id = uuidv7();
	const entityId = getMutationEntityId({
		serverFn: mutation.serverFn,
		payload: mutation.payload,
	});

	if (
		entityId &&
		(mutation.scope === "lessons" || mutation.scope === "classes")
	) {
		const rows = await qry<Record<string, unknown>>(
			`SELECT * FROM _outbox
       WHERE scope = ? AND entity_id = ? AND status = 'pending'
       ORDER BY sequence DESC LIMIT 1;`,
			[mutation.scope, entityId],
		);
		const previous = rows[0] ? await decodeRawRow(rows[0]) : null;

		if (previous?.type === "create" && mutation.type === "delete") {
			await exec("DELETE FROM _outbox WHERE id = ?;", [previous.id]);
			const table = mutation.scope === "lessons" ? "lesson" : "class";
			await exec(`DELETE FROM ${table} WHERE id = ?;`, [entityId]);
			return { id: previous.id, cancelledCreate: true };
		}

		if (previous) {
			const merged = mergePayloads(
				previous,
				mutation as EnqueueMutation<MutationServerFnName>,
			);
			if (merged) {
				await exec(
					`UPDATE _outbox
           SET mutation_type = ?, server_fn = ?, payload_json = ?,
               next_attempt_at = ?, error_kind = NULL, last_error = NULL
           WHERE id = ?;`,
					[
						merged.type,
						merged.serverFn,
						await serializePayload(merged.serverFn, merged.payload),
						now,
						previous.id,
					],
				);
				return { id: previous.id, cancelledCreate: false };
			}
		}
	}

	const sequenceRows = await qry<{ value: number }>(
		"SELECT COALESCE(MAX(sequence), 0) + 1 AS value FROM _outbox;",
	);
	const sequence = Number(sequenceRows[0]?.value ?? 1);
	await exec(
		`INSERT INTO _outbox
      (id, scope, mutation_type, server_fn, payload_json, idempotency_key,
       status, entity_id, created_at, sequence, retry_count, next_attempt_at,
       lease_owner, lease_expires_at, error_kind, last_error, remote_record_json)
     VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, 0, ?, NULL, NULL, NULL, NULL, NULL);`,
		[
			id,
			mutation.scope,
			mutation.type,
			mutation.serverFn,
			await serializePayload(mutation.serverFn, mutation.payload),
			mutation.idempotencyKey,
			entityId,
			now,
			sequence,
			now,
		],
	);
	return { id, cancelledCreate: false };
}

export async function enqueue<K extends MutationServerFnName>(
	mutation: EnqueueMutation<K>,
): Promise<string> {
	await ensureOutboxSchema();
	let result: EnqueueResult | null = null;
	await transaction(async (exec, qry) => {
		result = await enqueueUsingTransaction(mutation, exec, qry);
	});
	emitChange();
	return (result as EnqueueResult | null)?.id ?? mutation.idempotencyKey;
}

function isPhysicallyOnline() {
	return typeof navigator === "undefined" || navigator.onLine !== false;
}

export async function flushIfOnline() {
	const { onlineManager } = await import("@tanstack/react-query");
	if (isPhysicallyOnline() && onlineManager.isOnline()) {
		void flushMutationQueue();
	}
}

export async function enqueueAndFlushIfOnline<K extends MutationServerFnName>(
	mutation: EnqueueMutation<K>,
) {
	const id = await enqueue(mutation);
	await flushIfOnline();
	return id;
}

async function recoverExpiredLeases() {
	await execute(
		`UPDATE _outbox
     SET status = 'pending', lease_owner = NULL, lease_expires_at = NULL,
         next_attempt_at = MIN(next_attempt_at, ?),
         last_error = COALESCE(last_error, 'Recovered an expired sync lease')
     WHERE status = 'inFlight' AND lease_expires_at <= ?;`,
		[Date.now(), Date.now()],
	);
}

export async function getAll(): Promise<QueuedMutation[]> {
	await ensureOutboxSchema();
	await recoverExpiredLeases();
	const rows = await query<Record<string, unknown>>(
		"SELECT * FROM _outbox ORDER BY sequence ASC;",
	);
	const values = await Promise.all(rows.map(decodeRawRow));
	return values.filter((value): value is QueuedMutation => value !== null);
}

export async function getPending() {
	return (await getAll()).filter((mutation) => mutation.status === "pending");
}

export async function getCorruptCount() {
	await ensureOutboxSchema();
	const rows = await query<{ count: number }>(
		"SELECT COUNT(*) AS count FROM _outbox WHERE status = 'corrupt';",
	);
	return rows[0]?.count ?? 0;
}

export async function hasExistingMutation(
	scope: MutationScope,
	entityId: string,
) {
	return (await getAll()).some(
		(mutation) => mutation.scope === scope && mutation.entityId === entityId,
	);
}

export async function remove(id: string) {
	await ensureOutboxSchema();
	await execute("DELETE FROM _outbox WHERE id = ?;", [id]);
	emitChange();
}

export async function removeMutationsForEntity(
	scope: MutationScope,
	entityId: string,
) {
	await ensureOutboxSchema();
	await execute("DELETE FROM _outbox WHERE scope = ? AND entity_id = ?;", [
		scope,
		entityId,
	]);
	emitChange();
}

export async function retryMutation(id: string) {
	await ensureOutboxSchema();
	await transaction(async (exec, qry) => {
		const rows = await qry<Record<string, unknown>>(
			"SELECT * FROM _outbox WHERE id = ?;",
			[id],
		);
		const mutation = rows[0] ? await decodeRawRow(rows[0]) : null;
		let payloadJson: string | null = null;
		if (
			mutation &&
			isRecord(mutation.payload) &&
			typeof mutation.remoteRecord?.serverRevision === "number"
		) {
			payloadJson = await serializePayload(mutation.serverFn, {
				...mutation.payload,
				expectedRevision: mutation.remoteRecord.serverRevision,
			});
		}
		await exec(
			`UPDATE _outbox SET status = 'pending', next_attempt_at = ?,
         lease_owner = NULL, lease_expires_at = NULL, error_kind = NULL,
         last_error = NULL, remote_record_json = NULL,
         payload_json = COALESCE(?, payload_json) WHERE id = ?;`,
			[Date.now(), payloadJson, id],
		);
	});
	emitChange();
	await flushIfOnline();
}

export async function discardMutation(id: string) {
	await ensureOutboxSchema();
	await transaction(async (exec, qry) => {
		const rows = await qry<Record<string, unknown>>(
			"SELECT * FROM _outbox WHERE id = ?;",
			[id],
		);
		const mutation = rows[0] ? await decodeRawRow(rows[0]) : null;
		if (!mutation) return;
		await exec("DELETE FROM _outbox WHERE id = ?;", [id]);
		if (
			mutation.entityId &&
			(mutation.scope === "lessons" || mutation.scope === "classes")
		) {
			const table = mutation.scope === "lessons" ? "lesson" : "class";
			if (mutation.type === "create") {
				await exec(`DELETE FROM ${table} WHERE id = ?;`, [mutation.entityId]);
			} else {
				await exec(`UPDATE ${table} SET sync_status = 'synced' WHERE id = ?;`, [
					mutation.entityId,
				]);
			}
			await exec(
				`INSERT INTO _sync_cursors(scope, revision, synced_at) VALUES (?, 0, unixepoch())
         ON CONFLICT(scope) DO UPDATE SET revision = 0, synced_at = unixepoch();`,
				[mutation.scope],
			);
		}
	});
	emitChange();
}

export function registerServerFn<K extends MutationServerFnName>(
	name: K,
	fn: (
		payload: MutationServerFnPayloadMap[K],
		signal?: AbortSignal,
	) => Promise<unknown>,
) {
	serverFnRegistry.set(name, async (payload, signal) => {
		const parsed = mutationPayloadSchemas[name].safeParse(payload);
		if (!parsed.success) {
			throw new ValidationError(
				`Invalid payload for server function "${name}" during replay`,
				"VALIDATION_ERROR",
			);
		}
		return fn(parsed.data as MutationServerFnPayloadMap[K], signal);
	});
}

async function ensureServerFnRegistry() {
	if (registryBootstrapped || serverFnRegistry.size > 0) {
		registryBootstrapped = true;
		return;
	}
	const { registerAllMutations } = await import("@/lib/mutation-registration");
	registerAllMutations(registerServerFn);
	registryBootstrapped = true;
}

async function claimNextMutation(): Promise<QueuedMutation | null> {
	let claimed: QueuedMutation | null = null;
	const now = Date.now();
	await transaction(async (exec, qry) => {
		await exec(
			`UPDATE _outbox SET status = 'pending', lease_owner = NULL, lease_expires_at = NULL
       WHERE status = 'inFlight' AND lease_expires_at <= ?;`,
			[now],
		);
		const rows = await qry<Record<string, unknown>>(
			"SELECT * FROM _outbox ORDER BY sequence ASC;",
		);
		const decoded = (await Promise.all(rows.map(decodeRawRow))).filter(
			(value): value is QueuedMutation => value !== null,
		);
		const candidate = decoded.find((mutation) => {
			if (mutation.status !== "pending" || mutation.nextAttemptAt > now) {
				return false;
			}
			if (!mutation.entityId) return true;
			return !decoded.some(
				(other) =>
					other.scope === mutation.scope &&
					other.entityId === mutation.entityId &&
					other.sequence < mutation.sequence,
			);
		});
		if (!candidate) return;
		await exec(
			`UPDATE _outbox SET status = 'inFlight', lease_owner = ?, lease_expires_at = ?
       WHERE id = ? AND status = 'pending';`,
			[TAB_OWNER_ID, now + LEASE_DURATION_MS, candidate.id],
		);
		const verify = await qry<Record<string, unknown>>(
			"SELECT * FROM _outbox WHERE id = ? AND lease_owner = ? AND status = 'inFlight';",
			[candidate.id, TAB_OWNER_ID],
		);
		claimed = verify[0] ? await decodeRawRow(verify[0]) : null;
	});
	if (claimed) emitChange();
	return claimed;
}

function getStatus(error: unknown) {
	if (!isRecord(error)) return null;
	const status = error.status ?? error.statusCode;
	return typeof status === "number" ? status : null;
}

function classifyError(error: unknown): ClassifiedError {
	const message = error instanceof Error ? error.message : String(error);
	const status = getStatus(error);
	const remote =
		isRecord(error) && isRecord(error.serverRecord) ? error.serverRecord : null;

	if (status === 401) {
		return {
			kind: "authentication",
			status: "blocked",
			message,
			remoteRecord: null,
		};
	}
	if (status === 403) {
		return {
			kind: "authorization",
			status: "blocked",
			message,
			remoteRecord: null,
		};
	}
	if (status === 409) {
		return {
			kind: "conflict",
			status: "conflict",
			message,
			remoteRecord: remote,
		};
	}
	if (status !== null && status >= 400 && status < 500) {
		return {
			kind: "validation",
			status: "blocked",
			message,
			remoteRecord: null,
		};
	}
	if (status !== null && status >= 500) {
		return { kind: "server", status: "pending", message, remoteRecord: null };
	}
	if (
		error instanceof TypeError ||
		(error instanceof Error &&
			(error.name === "AbortError" || /network|fetch|offline/i.test(message)))
	) {
		return { kind: "network", status: "pending", message, remoteRecord: null };
	}
	return { kind: "unknown", status: "pending", message, remoteRecord: null };
}

function backoffFor(retryCount: number) {
	return Math.min(1_000 * 2 ** Math.min(retryCount, 10), MAX_BACKOFF_MS);
}

async function recordFailure(mutation: QueuedMutation, error: unknown) {
	const classified = classifyError(error);
	const retryCount = mutation.retryCount + 1;
	await execute(
		`UPDATE _outbox
     SET status = ?, retry_count = ?, next_attempt_at = ?, lease_owner = NULL,
         lease_expires_at = NULL, error_kind = ?, last_error = ?, remote_record_json = ?
     WHERE id = ? AND lease_owner = ?;`,
		[
			classified.status,
			retryCount,
			classified.status === "pending"
				? Date.now() + backoffFor(retryCount)
				: Date.now(),
			classified.kind,
			classified.message,
			classified.remoteRecord ? JSON.stringify(classified.remoteRecord) : null,
			mutation.id,
			TAB_OWNER_ID,
		],
	);
}

function getServerRevision(result: unknown) {
	if (!isRecord(result)) return null;
	const value = result.serverRevision;
	return typeof value === "number" && Number.isSafeInteger(value)
		? value
		: null;
}

async function reconcileSuccess(
	mutation: QueuedMutation,
	serverResult: unknown,
) {
	await transaction(async (exec, qry) => {
		const successorRows = mutation.entityId
			? await qry<Record<string, unknown>>(
					`SELECT * FROM _outbox
           WHERE scope = ? AND entity_id = ? AND sequence > ?
           ORDER BY sequence ASC LIMIT 1;`,
					[mutation.scope, mutation.entityId, mutation.sequence],
				)
			: [];
		const successor = successorRows[0]
			? await decodeRawRow(successorRows[0])
			: null;
		const serverRevision = getServerRevision(serverResult);

		if (successor && isRecord(successor.payload) && serverRevision !== null) {
			const rebasedPayload = {
				...successor.payload,
				expectedRevision: serverRevision,
			};
			await exec("UPDATE _outbox SET payload_json = ? WHERE id = ?;", [
				await serializePayload(successor.serverFn, rebasedPayload),
				successor.id,
			]);
		}

		if (mutation.serverFn === "submitStudentProgressEvent") {
			if (isRecord(mutation.payload)) {
				const key = getStringField(mutation.payload, "idempotencyKey");
				if (key) {
					await exec(
						"UPDATE student_progress_event SET sync_status = 'synced' WHERE idempotency_key = ?;",
						[key],
					);
				}
			}
		} else if (
			mutation.entityId &&
			(mutation.scope === "lessons" || mutation.scope === "classes")
		) {
			const table = mutation.scope === "lessons" ? "lesson" : "class";
			if (mutation.type === "delete" && !successor) {
				await exec(`DELETE FROM ${table} WHERE id = ?;`, [mutation.entityId]);
			} else {
				await exec(
					`UPDATE ${table}
           SET sync_status = ?, base_revision = COALESCE(?, base_revision)
           WHERE id = ?;`,
					[successor ? "pending" : "synced", serverRevision, mutation.entityId],
				);
			}
		}

		await exec("DELETE FROM _outbox WHERE id = ? AND lease_owner = ?;", [
			mutation.id,
			TAB_OWNER_ID,
		]);
	});

	if (typeof window !== "undefined") {
		const { getQueryClient } = await import("@/lib/query-client");
		await getQueryClient().invalidateQueries({ queryKey: [mutation.scope] });
	}
}

async function executeClaimedMutation(mutation: QueuedMutation) {
	const fn = serverFnRegistry.get(mutation.serverFn);
	if (!fn) {
		throw new ValidationError(
			`Unknown server function: ${mutation.serverFn}`,
			"VALIDATION_ERROR",
		);
	}

	const controller = new AbortController();
	const renewLease = setInterval(() => {
		void execute(
			`UPDATE _outbox SET lease_expires_at = ?
       WHERE id = ? AND lease_owner = ? AND status = 'inFlight';`,
			[Date.now() + LEASE_DURATION_MS, mutation.id, TAB_OWNER_ID],
		);
	}, LEASE_RENEW_INTERVAL_MS);
	const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

	try {
		const result = await fn(mutation.payload, controller.signal);
		await reconcileSuccess(mutation, result);
	} finally {
		clearTimeout(timeout);
		clearInterval(renewLease);
	}
}

export interface FlushResult {
	succeeded: number;
	failed: number;
	skipped: number;
}

export async function flushMutationQueue(): Promise<FlushResult> {
	if (flushInFlight) return flushInFlight;
	flushInFlight = (async () => {
		await ensureOutboxSchema();
		await ensureServerFnRegistry();
		const result: FlushResult = { succeeded: 0, failed: 0, skipped: 0 };
		while (true) {
			const mutation = await claimNextMutation();
			if (!mutation) break;
			try {
				await executeClaimedMutation(mutation);
				result.succeeded++;
			} catch (error) {
				await recordFailure(mutation, error);
				result.failed++;
			}
		}
		emitChange();
		return result;
	})();

	try {
		return await flushInFlight;
	} finally {
		flushInFlight = null;
	}
}

const changeListeners = new Set<() => void>();
function emitChange() {
	for (const listener of changeListeners) listener();
}

export function subscribe(listener: () => void) {
	changeListeners.add(listener);
	return () => changeListeners.delete(listener);
}

export async function clearMutationQueue() {
	await ensureOutboxSchema();
	await execute("DELETE FROM _outbox;");
	emitChange();
}
