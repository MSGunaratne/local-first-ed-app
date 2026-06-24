import { describe, expect, it } from "vitest";
import {
	analyticsBatchIngestSchema,
	lessonFeedbackInputSchema,
	studentProgressEventInputSchema,
} from "./analytics.schema";

describe("analytics schemas", () => {
	it("accepts pseudonymous batched analytics payloads", () => {
		const parsed = analyticsBatchIngestSchema.parse({
			idempotencyKey: "batch-1",
			sessions: [
				{
					id: "session-1",
					pseudonymousActorId: "anon-2026-06-24",
					actorType: "anonymous",
					authState: "anonymous",
					entryRoute: "/student",
					deviceClass: "mobile",
					startedAt: new Date("2026-06-24T10:00:00.000Z"),
				},
			],
			events: [
				{
					sessionId: "session-1",
					idempotencyKey: "event-1",
					pseudonymousActorId: "anon-2026-06-24",
					actorType: "anonymous",
					authState: "anonymous",
					eventType: "page_view",
					occurredAt: new Date("2026-06-24T10:01:00.000Z"),
					routeTemplate: "/student",
				},
			],
		});

		expect(parsed.sessions).toHaveLength(1);
		expect(parsed.events).toHaveLength(1);
	});

	it("rejects oversized analytics batches", () => {
		expect(() =>
			analyticsBatchIngestSchema.parse({
				idempotencyKey: "batch-1",
				sessions: [],
				events: Array.from({ length: 201 }, (_, index) => ({
					sessionId: "session-1",
					idempotencyKey: `event-${index}`,
					pseudonymousActorId: "anon-2026-06-24",
					actorType: "anonymous",
					authState: "anonymous",
					eventType: "page_view",
					occurredAt: new Date("2026-06-24T10:01:00.000Z"),
				})),
			}),
		).toThrow();
	});

	it("validates lesson feedback rating boundaries", () => {
		expect(() =>
			lessonFeedbackInputSchema.parse({
				idempotencyKey: "feedback-1",
				lessonId: "lesson-1",
				pseudonymousActorId: "anon-2026-06-24",
				rating: 6,
			}),
		).toThrow();

		expect(
			lessonFeedbackInputSchema.parse({
				idempotencyKey: "feedback-1",
				lessonId: "lesson-1",
				pseudonymousActorId: "anon-2026-06-24",
				rating: 5,
				comment: " Useful lesson ",
			}),
		).toMatchObject({
			rating: 5,
			comment: "Useful lesson",
		});
	});

	it("validates student progress event status", () => {
		expect(
			studentProgressEventInputSchema.parse({
				idempotencyKey: "progress-1",
				lessonId: "lesson-1",
				status: "completed",
				occurredAt: "2026-06-24T10:00:00.000Z",
			}),
		).toMatchObject({
			status: "completed",
		});

		expect(() =>
			studentProgressEventInputSchema.parse({
				idempotencyKey: "progress-1",
				lessonId: "lesson-1",
				status: "paused",
				occurredAt: "2026-06-24T10:00:00.000Z",
			}),
		).toThrow();
	});
});
