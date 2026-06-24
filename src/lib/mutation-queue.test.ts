import { webcrypto } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

Object.defineProperty(globalThis, "crypto", {
	value: webcrypto,
	configurable: true,
});

type OutboxRow = {
	id: string;
	scope: string;
	mutation_type: string;
	server_fn: string;
	payload_json: string;
	idempotency_key: string;
	status: "pending" | "in-flight" | "failed";
	created_at: number;
	retry_count: number;
	last_error: string | null;
};

const outboxRows: OutboxRow[] = [];
const progressSyncedKeys: string[] = [];

vi.mock("@/lib/local-db/init", () => ({
	execute: vi.fn(async (sql: string, params: unknown[] = []) => {
		if (sql.includes("INSERT INTO _outbox")) {
			outboxRows.push({
				id: String(params[0]),
				scope: String(params[1]),
				mutation_type: String(params[2]),
				server_fn: String(params[3]),
				payload_json: String(params[4]),
				idempotency_key: String(params[5]),
				status: params[6] as OutboxRow["status"],
				created_at: Number(params[7]),
				retry_count: Number(params[8]),
				last_error: params[9] == null ? null : String(params[9]),
			});
			return;
		}

		if (sql.includes("DELETE FROM _outbox WHERE id = ?")) {
			const index = outboxRows.findIndex((row) => row.id === params[0]);
			if (index >= 0) outboxRows.splice(index, 1);
			return;
		}

		if (sql.includes("UPDATE _outbox SET status = 'in-flight'")) {
			const row = outboxRows.find((item) => item.id === params[0]);
			if (row) row.status = "in-flight";
			return;
		}

		if (sql.includes("SET status = 'failed'")) {
			const row = outboxRows.find((item) => item.id === params[1]);
			if (row) {
				row.status = "failed";
				row.retry_count += 1;
				row.last_error = String(params[0]);
			}
			return;
		}

		if (sql.includes("UPDATE student_progress_event SET sync_status")) {
			progressSyncedKeys.push(String(params[0]));
		}
	}),
	query: vi.fn(async () => outboxRows),
}));

vi.mock("@/lib/local-db", () => ({
	markSynced: vi.fn(),
	purgeSynced: vi.fn(),
}));

describe("mutation queue", () => {
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
			payload: { id: "lesson-1", title: "Lesson" },
			idempotencyKey: "lesson-1",
		});

		const pending = await getPending();

		expect(pending).toHaveLength(1);
		expect(pending[0]).toMatchObject({
			scope: "lessons",
			type: "create",
			serverFn: "createLesson",
			idempotencyKey: "lesson-1",
		});
	}, 15_000);

	it("flushes successful mutations and removes them from the outbox", async () => {
		const serverFn = vi.fn(async () => ({ success: true }));
		const { enqueue, flushMutationQueue, registerServerFn } = await import(
			"./mutation-queue"
		);
		registerServerFn("createLesson", serverFn);

		await enqueue({
			scope: "lessons",
			type: "create",
			serverFn: "createLesson",
			payload: { id: "lesson-1", title: "Lesson" },
			idempotencyKey: "lesson-1",
		});

		await expect(flushMutationQueue()).resolves.toEqual({
			succeeded: 1,
			failed: 0,
			skipped: 0,
		});
		expect(serverFn).toHaveBeenCalledWith(
			expect.objectContaining({ id: "lesson-1" }),
		);
		expect(outboxRows).toHaveLength(0);
	});

	it("marks failed mutations for retry", async () => {
		const serverFn = vi.fn(async () => {
			throw new Error("network down");
		});
		const { enqueue, flushMutationQueue, registerServerFn } = await import(
			"./mutation-queue"
		);
		registerServerFn("createLesson", serverFn);

		await enqueue({
			scope: "lessons",
			type: "create",
			serverFn: "createLesson",
			payload: { id: "lesson-1", title: "Lesson" },
			idempotencyKey: "lesson-1",
		});

		await expect(flushMutationQueue()).resolves.toEqual({
			succeeded: 0,
			failed: 1,
			skipped: 0,
		});
		expect(outboxRows[0]).toMatchObject({
			status: "failed",
			retry_count: 1,
			last_error: "network down",
		});
	});

	it("marks local progress events as synced after analytics replay", async () => {
		const serverFn = vi.fn(async () => ({ success: true }));
		const { isEncryptedPayloadJson } = await import(
			"./local-payload-encryption"
		);
		const { enqueue, flushMutationQueue, getPending, registerServerFn } =
			await import("./mutation-queue");
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
		expect(outboxRows[0].payload_json).not.toContain("lesson-1");
		await expect(getPending()).resolves.toEqual([
			expect.objectContaining({
				payload: expect.objectContaining({
					lessonId: "lesson-1",
					status: "completed",
				}),
			}),
		]);

		await flushMutationQueue();

		expect(progressSyncedKeys).toEqual(["progress-1"]);
		expect(outboxRows).toHaveLength(0);
	});
});
