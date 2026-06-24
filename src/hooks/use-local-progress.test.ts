import { describe, expect, it } from "vitest";
import { progressRowsToMap } from "./use-local-progress";

describe("progressRowsToMap", () => {
	it("hydrates started rows as in-progress", () => {
		expect(
			progressRowsToMap([
				{
					lesson_id: "lesson-1",
					progress_status: "started",
					occurred_at: 10,
				},
			]),
		).toEqual({
			"lesson-1": {
				status: "in-progress",
				lastAccessed: 10_000,
			},
		});
	});

	it("keeps completed status when both started and completed rows exist", () => {
		expect(
			progressRowsToMap([
				{
					lesson_id: "lesson-1",
					progress_status: "started",
					occurred_at: 10,
				},
				{
					lesson_id: "lesson-1",
					progress_status: "completed",
					occurred_at: 20,
				},
			]),
		).toEqual({
			"lesson-1": {
				status: "completed",
				lastAccessed: 20_000,
			},
		});
	});
});
