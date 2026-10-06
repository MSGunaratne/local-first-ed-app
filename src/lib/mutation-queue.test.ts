import { webcrypto } from "node:crypto";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

Object.defineProperty(globalThis, "crypto", {
	value: webcrypto,
	configurable: true,
});

type OutboxRow = {
	id: string;
	scope: string;
	mutation_type: "create" | "update" | "delete";
	server_fn: string;
	payload_json: string;
	idempotency_key: string;
	status: "pending" | "inFlight" | "blocked" | "conflict";
	entity_id: string | null;
	created_at: number;
	sequence: number;
	retry_count: number;
	next_attempt_at: number;
	lease_owner: string | null;
	lease_expires_at: number | null;
	error_kind: string | null;
	last_error: string | null;
	remote_record_json: string | null;
};

const outboxRows: OutboxRow[] = [];
const progressSyncedKeys: string[] = [];
const lessonId = "01977f52-0000-7000-8000-000000000001";

async function executeSql(sql: string, params: readonly unknown[] = []) {
	if (sql.includes("INSERT INTO _outbox")) {
		outboxRows.push({
			id: String(params[0]),
			scope: String(params[1]),
			mutation_type: params[2] as OutboxRow["mutation_type"],
			server_fn: String(params[3]),
			payload_json: String(params[4]),
			idempotency_key: String(params[5]),
			status: "pending",
			entity_id: params[6] == null ? null : String(params[6]),
			created_at: Number(params[7]),
			sequence: Number(params[8]),
			retry_count: 0,
			next_attempt_at: Number(params[9]),
			lease_owner: null,
			lease_expires_at: null,
			error_kind: null,
			last_error: null,
			remote_record_json: null,
		});
		return;
	}

	if (sql.includes("DELETE FROM _outbox WHERE id = ?")) {
		const index = outboxRows.findIndex((row) => row.id === params[0]);
		if (index >= 0) outboxRows.splice(index, 1);
		return;
	}

	if (sql.includes("SET mutation_type = ?")) {
		const row = outboxRows.find((item) => item.id === params[4]);
		if (row) {
			row.mutation_type = params[0] as OutboxRow["mutation_type"];
			row.server_fn = String(params[1]);
			row.payload_json = String(params[2]);
			row.next_attempt_at = Number(params[3]);
			row.error_kind = null;
			row.last_error = null;
		}
		return;
	}

	if (sql.includes("SET payload_json = ? WHERE id = ?")) {
		const row = outboxRows.find((item) => item.id === params[1]);
		if (row) row.payload_json = String(params[0]);
		return;
	}

	if (sql.includes("SET status = 'inFlight', lease_owner")) {
		const row = outboxRows.find((item) => item.id === params[2]);
		if (row?.status === "pending") {
			row.status = "inFlight";
			row.lease_owner = String(params[0]);
			row.lease_expires_at = Number(params[1]);
		}
		return;
	}

	if (sql.includes("SET status = ?, retry_count = ?")) {
		const row = outboxRows.find((item) => item.id === params[6]);
		if (row) {
			row.status = params[0] as OutboxRow["status"];
			row.retry_count = Number(params[1]);
			row.next_attempt_at = Number(params[2]);
			row.lease_owner = null;
			row.lease_expires_at = null;
			row.error_kind = String(params[3]);
			row.last_error = String(params[4]);
			row.remote_record_json = params[5] == null ? null : String(params[5]);
		}
		return;
	}

	if (sql.includes("UPDATE student_progress_event SET sync_status")) {
		progressSyncedKeys.push(String(params[0]));
	}
}

async function querySql<T>(sql: string, params: readonly unknown[] = []) {
	if (sql.includes("COALESCE(MAX(sequence)")) {
		return [
			{ value: Math.max(0, ...outboxRows.map((row) => row.sequence)) + 1 },
		] as T[];
	}
	if (sql.includes("scope = ? AND entity_id = ? AND status = 'pending'")) {
		return outboxRows
			.filter(
				(row) =>
					row.scope === params[0] &&
					row.entity_id === params[1] &&
					row.status === "pending",
			)
			.sort((a, b) => b.sequence - a.sequence)
			.slice(0, 1) as T[];
	}
	if (sql.includes("sequence > ?")) {
		return outboxRows
			.filter(
				(row) =>
					row.scope === params[0] &&
					row.entity_id === params[1] &&
					row.sequence > Number(params[2]),
			)
			.sort((a, b) => a.sequence - b.sequence)
			.slice(0, 1) as T[];
	}
	if (sql.includes("lease_owner = ?") && sql.includes("status = 'inFlight'")) {
		return outboxRows.filter(
			(row) =>
				row.id === params[0] &&
				row.lease_owner === params[1] &&
				row.status === "inFlight",
		) as T[];
	}
	if (sql.includes("WHERE id = ?")) {
		return outboxRows.filter((row) => row.id === params[0]) as T[];
	}
	return [...outboxRows].sort((a, b) => a.sequence - b.sequence) as T[];
}

vi.mock("@/lib/local-db/init", () => ({
	execute: vi.fn(executeSql),
	query: vi.fn(querySql),
	transaction: vi.fn(
		async (
			fn: (exec: typeof executeSql, qry: typeof querySql) => Promise<void>,
		) => fn(executeSql, querySql),
	),
}));

describe("mutation queue", () => {
	beforeAll(async () => {
		await import("./mutation-queue");
	}, 20_000);

	beforeEach(() => {
		outboxRows.length = 0;
		progressSyncedKeys.length = 0;
		vi.clearAllMocks();
	});

	it("enqueues and returns pending mutations in FIFO order", async () => {
		const { enqueue, getPending } = await import("./mutation-queue");
		await enqueue({
			scope: "lessons",
			type: "create",
			serverFn: "createLesson",
			payload: { id: lessonId, title: "Lesson" },
			idempotencyKey: "lesson-1",
		});
		await expect(getPending()).resolves.toEqual([
			expect.objectContaining({
				scope: "lessons",
				status: "pending",
				entityId: lessonId,
			}),
		]);
	});

	it("coalesces create followed by updates into one create", async () => {
		const { enqueue, getPending } = await import("./mutation-queue");
		await enqueue({
			scope: "lessons",
			type: "create",
			serverFn: "createLesson",
			payload: { id: lessonId, title: "First" },
			idempotencyKey: "lesson-1",
		});
		await enqueue({
			scope: "lessons",
			type: "update",
			serverFn: "updateLesson",
			payload: { id: lessonId, data: { title: "Latest" }, expectedRevision: 0 },
			idempotencyKey: "lesson-2",
		});

		const pending = await getPending();
		expect(pending).toHaveLength(1);
		expect(pending[0]).toMatchObject({
			type: "create",
			payload: expect.objectContaining({ title: "Latest" }),
		});
	});

	it("coalesces update chains and cancels an unsent create followed by delete", async () => {
		const { enqueue, getPending } = await import("./mutation-queue");
		await enqueue({
			scope: "lessons",
			type: "update",
			serverFn: "updateLesson",
			payload: { id: lessonId, data: { title: "First" }, expectedRevision: 4 },
			idempotencyKey: "lesson-1",
		});
		await enqueue({
			scope: "lessons",
			type: "delete",
			serverFn: "deleteLesson",
			payload: { id: lessonId, expectedRevision: 4 },
			idempotencyKey: "lesson-2",
		});
		expect(await getPending()).toEqual([
			expect.objectContaining({ type: "delete", entityId: lessonId }),
		]);

		outboxRows.length = 0;
		await enqueue({
			scope: "lessons",
			type: "create",
			serverFn: "createLesson",
			payload: { id: lessonId, title: "Temporary" },
			idempotencyKey: "lesson-3",
		});
		await enqueue({
			scope: "lessons",
			type: "delete",
			serverFn: "deleteLesson",
			payload: { id: lessonId, expectedRevision: 0 },
			idempotencyKey: "lesson-4",
		});
		expect(await getPending()).toHaveLength(0);
	});

	it("flushes successful mutations and removes them from the outbox", async () => {
		const serverFn = vi.fn(async () => ({ serverRevision: 10 }));
		const { enqueue, flushMutationQueue, registerServerFn } = await import(
			"./mutation-queue"
		);
		registerServerFn("createLesson", serverFn);
		await enqueue({
			scope: "lessons",
			type: "create",
			serverFn: "createLesson",
			payload: { id: lessonId, title: "Lesson" },
			idempotencyKey: "lesson-1",
		});

		await expect(flushMutationQueue()).resolves.toEqual({
			succeeded: 1,
			failed: 0,
			skipped: 0,
		});
		expect(serverFn).toHaveBeenCalledWith(
			expect.objectContaining({ id: lessonId }),
			expect.any(AbortSignal),
		);
		expect(outboxRows).toHaveLength(0);
	});

	it("rebases a successor created while its predecessor is in flight", async () => {
		const queue = await import("./mutation-queue");
		const updateServerFn = vi.fn(async () => ({ serverRevision: 12 }));
		const createServerFn = vi.fn(async () => {
			await queue.enqueue({
				scope: "lessons",
				type: "update",
				serverFn: "updateLesson",
				payload: {
					id: lessonId,
					data: { title: "Latest" },
					expectedRevision: 0,
				},
				idempotencyKey: "lesson-successor",
			});
			return { serverRevision: 11 };
		});
		queue.registerServerFn("createLesson", createServerFn);
		queue.registerServerFn("updateLesson", updateServerFn);
		await queue.enqueue({
			scope: "lessons",
			type: "create",
			serverFn: "createLesson",
			payload: { id: lessonId, title: "First" },
			idempotencyKey: "lesson-create",
		});

		await expect(queue.flushMutationQueue()).resolves.toEqual({
			succeeded: 2,
			failed: 0,
			skipped: 0,
		});
		expect(updateServerFn).toHaveBeenCalledWith(
			expect.objectContaining({ expectedRevision: 11 }),
			expect.any(AbortSignal),
		);
		expect(outboxRows).toHaveLength(0);
	});

	it("retains network failures with backoff instead of exhausting them", async () => {
		const serverFn = vi.fn(async () => {
			throw new TypeError("network down");
		});
		const { enqueue, flushMutationQueue, registerServerFn } = await import(
			"./mutation-queue"
		);
		registerServerFn("createLesson", serverFn);
		await enqueue({
			scope: "lessons",
			type: "create",
			serverFn: "createLesson",
			payload: { id: lessonId, title: "Lesson" },
			idempotencyKey: "lesson-1",
		});

		await expect(flushMutationQueue()).resolves.toEqual({
			succeeded: 0,
			failed: 1,
			skipped: 0,
		});
		expect(outboxRows[0]).toMatchObject({
			status: "pending",
			retry_count: 1,
			error_kind: "network",
			last_error: "network down",
		});
		expect(outboxRows[0].next_attempt_at).toBeGreaterThan(Date.now());
	});

	it("retains a leased operation for its owning tab", async () => {
		const serverFn = vi.fn(async () => ({ serverRevision: 10 }));
		const queue = await import("./mutation-queue");
		queue.registerServerFn("createLesson", serverFn);
		await queue.enqueue({
			scope: "lessons",
			type: "create",
			serverFn: "createLesson",
			payload: { id: lessonId, title: "Lesson" },
			idempotencyKey: "lesson-lease",
		});
		outboxRows[0].status = "inFlight";
		outboxRows[0].lease_owner = "another-tab";
		outboxRows[0].lease_expires_at = Date.now() + 30_000;

		await expect(queue.flushMutationQueue()).resolves.toEqual({
			succeeded: 0,
			failed: 0,
			skipped: 0,
		});
		expect(serverFn).not.toHaveBeenCalled();
		expect(outboxRows[0].status).toBe("inFlight");
	});

	it("blocks validation failures for explicit user action", async () => {
		const serverFn = vi.fn(async () => {
			throw Object.assign(new Error("invalid title"), { status: 400 });
		});
		const { enqueue, flushMutationQueue, registerServerFn } = await import(
			"./mutation-queue"
		);
		registerServerFn("createLesson", serverFn);
		await enqueue({
			scope: "lessons",
			type: "create",
			serverFn: "createLesson",
			payload: { id: lessonId, title: "" },
			idempotencyKey: "lesson-1",
		});
		await flushMutationQueue();
		expect(outboxRows[0]).toMatchObject({
			status: "blocked",
			error_kind: "validation",
		});
	});

	it("retains revision conflicts with the remote version", async () => {
		const serverRecord = { id: lessonId, title: "Server", serverRevision: 18 };
		const serverFn = vi.fn(async () => {
			throw Object.assign(new Error("revision conflict"), {
				status: 409,
				serverRecord,
			});
		});
		const queue = await import("./mutation-queue");
		queue.registerServerFn("updateLesson", serverFn);
		await queue.enqueue({
			scope: "lessons",
			type: "update",
			serverFn: "updateLesson",
			payload: { id: lessonId, data: { title: "Local" }, expectedRevision: 4 },
			idempotencyKey: "lesson-conflict",
		});
		await queue.flushMutationQueue();
		expect(await queue.getAll()).toEqual([
			expect.objectContaining({
				status: "conflict",
				errorKind: "conflict",
				remoteRecord: serverRecord,
			}),
		]);
	});

	it("marks local progress events as synced after encrypted replay", async () => {
		const serverFn = vi.fn(async () => ({ success: true }));
		const { isEncryptedPayloadJson } = await import(
			"./local-payload-encryption"
		);
		const { enqueue, flushMutationQueue, registerServerFn } = await import(
			"./mutation-queue"
		);
		registerServerFn("submitStudentProgressEvent", serverFn);
		await enqueue({
			scope: "analytics",
			type: "create",
			serverFn: "submitStudentProgressEvent",
			payload: {
				idempotencyKey: "progress-1",
				lessonId: "lesson-1",
				status: "completed",
				occurredAt: new Date("2026-06-24T10:00:00.000Z"),
			},
			idempotencyKey: "progress-1",
		});
		expect(isEncryptedPayloadJson(outboxRows[0].payload_json)).toBe(true);
		await flushMutationQueue();
		expect(progressSyncedKeys).toEqual(["progress-1"]);
		expect(outboxRows).toHaveLength(0);
	});

	it("rejects user account mutations so credentials never enter the outbox", async () => {
		const { enqueue } = await import("./mutation-queue");
		await expect(
			enqueue({
				scope: "users",
				type: "create",
				serverFn: "createUser",
				payload: { email: "a@example.com", password: "Secret123!" },
				idempotencyKey: "user-1",
			}),
		).rejects.toThrow("require an active network connection");
		expect(outboxRows).toHaveLength(0);
	});
});
