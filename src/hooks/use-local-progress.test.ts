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

	it("keeps completed status even if a started row is encountered later", () => {
		expect(
			progressRowsToMap([
				{
					lesson_id: "lesson-1",
					progress_status: "completed",
					occurred_at: 20,
				},
				{
					lesson_id: "lesson-1",
					progress_status: "started",
					occurred_at: 30,
				},
			]),
		).toEqual({
			"lesson-1": {
				status: "completed",
				lastAccessed: 20_000,
			},
		});
	});

	it("tracks independent lessons separately", () => {
		expect(
			progressRowsToMap([
				{
					lesson_id: "lesson-1",
					progress_status: "started",
					occurred_at: 10,
				},
				{
					lesson_id: "lesson-2",
					progress_status: "completed",
					occurred_at: 15,
				},
			]),
		).toEqual({
			"lesson-1": {
				status: "in-progress",
				lastAccessed: 10_000,
			},
			"lesson-2": {
				status: "completed",
				lastAccessed: 15_000,
			},
		});
	});
});
