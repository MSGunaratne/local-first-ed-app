import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseSyncCursor, serializeSyncCursor } from "./sync-cursor";

const executedSql: string[] = [];
let rejectEntityWrite = false;

async function executeSql(sql: string) {
	executedSql.push(sql);
	if (rejectEntityWrite && sql.startsWith("INSERT INTO lesson")) {
		throw new Error("local entity write failed");
	}
}

async function querySql<T>() {
	return [] as T[];
}

vi.mock("@/lib/local-db/init", () => ({
	execute: vi.fn(executeSql),
	query: vi.fn(querySql),
	transaction: vi.fn(
		async (
			callback: (
				exec: typeof executeSql,
				query: typeof querySql,
			) => Promise<void>,
		) => callback(executeSql, querySql),
	),
}));

describe("sync cursor helpers", () => {
	beforeEach(() => {
		executedSql.length = 0;
		rejectEntityWrite = false;
	});

	it("parses a numeric revision", () => {
		expect(parseSyncCursor("42")).toBe(42);
	});

	it("rejects timestamps and malformed revisions", () => {
		expect(parseSyncCursor("2026-06-24T01:02:03.000Z")).toBeNull();
		expect(parseSyncCursor("-1")).toBeNull();
	});

	it("serializes a revision checkpoint", () => {
		expect(serializeSyncCursor(123)).toBe("123");
	});

	it("applies ordered changes before advancing the revision cursor", async () => {
		const { pullRecords } = await import("./local-db/sync");
		await pullRecords(
			"lessons",
			[
				{
					revision: 8,
					scope: "lessons",
					entityId: "lesson-1",
					operation: "upsert",
					data: { id: "lesson-1", title: "Revision eight" },
				},
				{
					revision: 9,
					scope: "lessons",
					entityId: "lesson-2",
					operation: "delete",
					data: null,
				},
			],
			9,
		);

		const upsertIndex = executedSql.findIndex((sql) =>
			sql.startsWith("INSERT INTO lesson"),
		);
		const tombstoneIndex = executedSql.findIndex((sql) =>
			sql.startsWith("DELETE FROM lesson"),
		);
		const cursorIndex = executedSql.findIndex((sql) =>
			sql.includes("INSERT INTO _sync_cursors"),
		);
		expect(upsertIndex).toBeGreaterThanOrEqual(0);
		expect(tombstoneIndex).toBeGreaterThan(upsertIndex);
		expect(cursorIndex).toBeGreaterThan(tombstoneIndex);
	});

	it("does not advance the revision when a local page write fails", async () => {
		const { pullRecords } = await import("./local-db/sync");
		rejectEntityWrite = true;
		await expect(
			pullRecords(
				"lessons",
				[
					{
						revision: 10,
						scope: "lessons",
						entityId: "lesson-1",
						operation: "upsert",
						data: { id: "lesson-1", title: "Broken page" },
					},
				],
				10,
			),
		).rejects.toThrow("local entity write failed");
		expect(
			executedSql.some((sql) => sql.includes("INSERT INTO _sync_cursors")),
		).toBe(false);
	});
});
