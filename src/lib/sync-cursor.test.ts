import { describe, expect, it } from "vitest";
import { parseSyncCursor, serializeSyncCursor } from "./sync-cursor";

describe("sync cursor helpers", () => {
	it("parses the structured cursor format", () => {
		expect(
			parseSyncCursor(
				JSON.stringify({ updatedAt: "2026-06-24T01:02:03.000Z", id: "b" }),
			),
		).toEqual({ updatedAt: "2026-06-24T01:02:03.000Z", id: "b" });
	});

	it("accepts legacy ISO timestamp cursors", () => {
		expect(parseSyncCursor("2026-06-24T01:02:03.000Z")).toEqual({
			updatedAt: "2026-06-24T01:02:03.000Z",
			id: "",
		});
	});

	it("serializes the last applied row as the next checkpoint", () => {
		expect(
			serializeSyncCursor({
				id: "lesson-1",
				updatedAt: new Date("2026-06-24T01:02:03.000Z"),
			}),
		).toEqual({
			updatedAt: "2026-06-24T01:02:03.000Z",
			id: "lesson-1",
		});
	});
});
