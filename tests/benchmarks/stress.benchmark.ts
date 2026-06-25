import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { webcrypto } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { findMatches } from "@/lib/content-mapper";
import { Subject } from "@/types/lesson";

Object.defineProperty(globalThis, "crypto", {
	value: webcrypto,
	configurable: true,
});

type BenchmarkSummary = {
	contentMatcher: {
		sampleCount: number;
		positiveCount: number;
		noiseCount: number;
		top1Correct: number;
		top3Correct: number;
		falsePositives: number;
		manualCorrectionCount: number;
		top1AccuracyPct: number;
		top3AccuracyPct: number;
		falsePositiveRatePct: number;
		manualCorrectionRatePct: number;
	};
	queueStress: {
		scenarios: Array<{
			batchSize: number;
			firstPassSucceeded: number;
			firstPassFailed: number;
			firstPassSuccessRatePct: number;
			finalSucceeded: number;
			finalRemaining: number;
			eventualSuccessRatePct: number;
		}>;
		firstPassSuccessRatePct: number;
		eventualSuccessRatePct: number;
	};
};

const OUTPUT_DIR = path.join("output", "testing");
const JSON_OUTPUT = path.join(OUTPUT_DIR, "benchmark-results.json");
const MD_OUTPUT = path.join(OUTPUT_DIR, "benchmark-summary.md");
const lessonId = "01977f52-0000-7000-8000-000000000001";

const contentPositiveCases = [
	{
		label: "English pronunciation basics",
		query: "pronunciation vowel consonant sounds reading",
		subject: Subject.ENGLISH,
		grade: 6,
		expectedId: "ENG-GR6-1.2",
	},
	{
		label: "English reading aloud",
		query: "reading aloud pauses intonation stories announcements",
		subject: Subject.ENGLISH,
		grade: 6,
		expectedId: "ENG-GR6-1.2",
	},
	{
		label: "Math place value",
		query: "place value writing numbers in words billions",
		subject: Subject.MATH,
		grade: 6,
		expectedId: "MAT-GR6-1.2",
	},
	{
		label: "Math number line",
		query: "negative numbers integers zero on the number line",
		subject: Subject.MATH,
		grade: 6,
		expectedId: "MAT-GR6-1.2",
	},
	{
		label: "ICT computer characteristics",
		query: "computer characteristics embedded systems reliability accuracy",
		subject: Subject.ICT,
		grade: 6,
		expectedId: "ICT-GR6-1.2",
	},
	{
		label: "ICT components",
		query: "cpu input output storage devices peripherals main memory",
		subject: Subject.ICT,
		grade: 6,
		expectedId: "ICT-GR6-1.2",
	},
	{
		label: "English phonics terms",
		query: "phonics sounds vowel consonant pronunciation",
		subject: Subject.ENGLISH,
		grade: 6,
		expectedId: "ENG-GR6-1.1",
	},
	{
		label: "Math OCR style phrase",
		query: "standard form place value number writing digits",
		subject: Subject.MATH,
		grade: 6,
		expectedId: "MAT-GR6-1.1",
	},
	{
		label: "ICT OCR style phrase",
		query: "computer characteristics embedded systems processing reliability",
		subject: Subject.ICT,
		grade: 6,
		expectedId: "ICT-GR6-1.1",
	},
	{
		label: "English OCR style phrase",
		query: "pronunciation basics vowel consonant sounds phonics",
		subject: Subject.ENGLISH,
		grade: 6,
		expectedId: "ENG-GR6-1.1",
	},
] as const;

const contentNoiseCases = [
	{
		label: "Unrelated noise",
		query: "@@@ xqz 123 random smudged camera shadow",
		subject: Subject.ENGLISH,
		grade: 6,
	},
	{
		label: "OCR distractor text",
		query: "computer festival shadow blurry classroom notes",
		subject: Subject.MATH,
		grade: 6,
	},
	{
		label: "Unrelated placeholder noise",
		query: "placeholder gibberish camera blur smudge",
		subject: Subject.ICT,
		grade: 6,
	},
	{
		label: "Mixed curriculum distractor",
		query: "place value computer pronunciation shadow",
		subject: Subject.ENGLISH,
		grade: 6,
	},
	{
		label: "Near-match distractor",
		query: "reading aloud computer components shadow",
		subject: Subject.MATH,
		grade: 6,
	},
] as const;

const queueBatchSizes = [10, 50, 100] as const;
const benchmarkSummary: BenchmarkSummary = {
	contentMatcher: {
		sampleCount: 0,
		positiveCount: 0,
		noiseCount: 0,
		top1Correct: 0,
		top3Correct: 0,
		falsePositives: 0,
		manualCorrectionCount: 0,
		top1AccuracyPct: 0,
		top3AccuracyPct: 0,
		falsePositiveRatePct: 0,
		manualCorrectionRatePct: 0,
	},
	queueStress: {
		scenarios: [],
		firstPassSuccessRatePct: 0,
		eventualSuccessRatePct: 0,
	},
};

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

		if (sql.includes("DELETE FROM _outbox WHERE id IN")) {
			for (const id of params) {
				const index = outboxRows.findIndex((row) => row.id === id);
				if (index >= 0) outboxRows.splice(index, 1);
			}
			return;
		}

		if (sql.includes("DELETE FROM _outbox;")) {
			outboxRows.length = 0;
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

		if (sql.includes("UPDATE _outbox SET retry_count = ?")) {
			const row = outboxRows.find((item) => item.id === params[1]);
			if (row) row.retry_count = Number(params[0]);
			return;
		}
	}),
	query: vi.fn(async () => outboxRows),
}));

vi.mock("@/lib/local-db", () => ({
	markSynced: vi.fn(),
	purgeSynced: vi.fn(),
}));

beforeEach(() => {
	outboxRows.length = 0;
	vi.clearAllMocks();
});

function formatPct(value: number) {
	return `${value.toFixed(1)}%`;
}

function toPct(part: number, total: number) {
	return total === 0 ? 0 : (part / total) * 100;
}

async function benchmarkContentMatcher() {
	const positiveResults = await Promise.all(
		contentPositiveCases.map(async (sample) => {
			const matches = await findMatches(sample.query, sample.subject, sample.grade);
			const top1 = matches[0]?.id === sample.expectedId;
			const top3 = matches.slice(0, 3).some((match) => match.id === sample.expectedId);
			return { top1, top3 };
		}),
	);

	const noiseResults = await Promise.all(
		contentNoiseCases.map(async (sample) => {
			const matches = await findMatches(sample.query, sample.subject, sample.grade);
			return matches.length > 0;
		}),
	);

	const top1Correct = positiveResults.filter((result) => result.top1).length;
	const top3Correct = positiveResults.filter((result) => result.top3).length;
	const falsePositives = noiseResults.filter(Boolean).length;
	const manualCorrectionCount = positiveResults.length - top1Correct;
	const sampleCount = positiveResults.length + contentNoiseCases.length;

	benchmarkSummary.contentMatcher = {
		sampleCount,
		positiveCount: positiveResults.length,
		noiseCount: contentNoiseCases.length,
		top1Correct,
		top3Correct,
		falsePositives,
		manualCorrectionCount,
		top1AccuracyPct: toPct(top1Correct, positiveResults.length),
		top3AccuracyPct: toPct(top3Correct, positiveResults.length),
		falsePositiveRatePct: toPct(falsePositives, contentNoiseCases.length),
		manualCorrectionRatePct: toPct(manualCorrectionCount, positiveResults.length),
	};

	expect(benchmarkSummary.contentMatcher.sampleCount).toBe(sampleCount);
}

async function benchmarkQueueStress() {
	const { enqueue, flushMutationQueue, registerServerFn, clearMutationQueue } =
		await import("@/lib/mutation-queue");

	const scenarios: BenchmarkSummary["queueStress"]["scenarios"] = [];
	let totalSucceeded = 0;
	let totalMutations = 0;
	let totalFinalSucceeded = 0;
	let totalFinalRemaining = 0;

	for (const batchSize of queueBatchSizes) {
		outboxRows.length = 0;
		await clearMutationQueue();

		const failOnce = new Set<string>();
		const transientFailureEvery = 10;

		registerServerFn("submitStudentProgressEvent", async (payload) => {
			const key = payload.idempotencyKey;
			if (failOnce.has(key)) {
				failOnce.delete(key);
				throw new Error("offline");
			}
			return { success: true };
		});

		for (let index = 0; index < batchSize; index++) {
			const idempotencyKey = `progress-${batchSize}-${index}`;
			if (index % transientFailureEvery === 0) {
				failOnce.add(idempotencyKey);
			}

			await enqueue({
				scope: "analytics",
				type: "create",
				serverFn: "submitStudentProgressEvent",
				payload: {
					idempotencyKey,
					lessonId,
					status: "completed",
					occurredAt: new Date("2026-06-24T10:00:00.000Z"),
				},
				idempotencyKey,
			});
		}

		const firstPass = await flushMutationQueue();
		const remainingAfterFirstPass = outboxRows.length;

		registerServerFn("submitStudentProgressEvent", async () => ({ success: true }));
		const secondPass = await flushMutationQueue();
		const remainingAfterSecondPass = outboxRows.length;

		scenarios.push({
			batchSize,
			firstPassSucceeded: firstPass.succeeded,
			firstPassFailed: firstPass.failed,
			firstPassSuccessRatePct: toPct(firstPass.succeeded, batchSize),
			finalSucceeded: firstPass.succeeded + secondPass.succeeded,
			finalRemaining: remainingAfterSecondPass,
			eventualSuccessRatePct: toPct(
				firstPass.succeeded + secondPass.succeeded,
				batchSize,
			),
		});

		totalSucceeded += firstPass.succeeded;
		totalMutations += batchSize;
		totalFinalSucceeded += firstPass.succeeded + secondPass.succeeded;
		totalFinalRemaining += remainingAfterSecondPass;

		expect(remainingAfterFirstPass).toBeGreaterThanOrEqual(firstPass.failed);
		expect(remainingAfterSecondPass).toBe(0);
		expect(secondPass.failed).toBe(0);
	}

	benchmarkSummary.queueStress = {
		scenarios,
		firstPassSuccessRatePct: toPct(totalSucceeded, totalMutations),
		eventualSuccessRatePct: toPct(totalFinalSucceeded, totalMutations),
	};

	expect(totalFinalRemaining).toBe(0);
}

describe("stress benchmark harness", () => {
	it("measures curriculum matcher quality", async () => {
		await benchmarkContentMatcher();
		expect(benchmarkSummary.contentMatcher.top1AccuracyPct).toBeGreaterThan(0);
	});

	it("measures queue replay under load", async () => {
		await benchmarkQueueStress();
		expect(benchmarkSummary.queueStress.scenarios).toHaveLength(3);
	});
});

afterAll(async () => {
	await mkdir(OUTPUT_DIR, { recursive: true });
	await writeFile(JSON_OUTPUT, `${JSON.stringify(benchmarkSummary, null, 2)}\n`);

	const md = [
		"# Stress Benchmark Summary",
		"",
		"## 8.3 Model and Algorithmic Testing",
		`- Top-1 curriculum match accuracy: ${formatPct(benchmarkSummary.contentMatcher.top1AccuracyPct)}`,
		`- Top-3 curriculum match accuracy: ${formatPct(benchmarkSummary.contentMatcher.top3AccuracyPct)}`,
		`- False-positive rate on unrelated noise: ${formatPct(benchmarkSummary.contentMatcher.falsePositiveRatePct)}`,
		`- Manual correction rate for noisy OCR-style samples: ${formatPct(benchmarkSummary.contentMatcher.manualCorrectionRatePct)}`,
		"",
		"## 8.4 Benchmarking",
		"- Curriculum curation time reduction and real-device offline load measurements remain manual benchmarking items and are not inferred by this automated harness.",
		"",
		"## 8.5 Further Evaluations",
		`- Queue first-pass success rate across 10/50/100 mutation bursts: ${formatPct(benchmarkSummary.queueStress.firstPassSuccessRatePct)}`,
		`- Eventual success rate after connectivity recovery: ${formatPct(benchmarkSummary.queueStress.eventualSuccessRatePct)}`,
		"",
		"### Queue Scenarios",
		...benchmarkSummary.queueStress.scenarios.map(
			(scenario) =>
				`- Batch ${scenario.batchSize}: first pass ${formatPct(scenario.firstPassSuccessRatePct)}, eventual ${formatPct(scenario.eventualSuccessRatePct)}, remaining ${scenario.finalRemaining}`,
		),
		"",
	].join("\n");

	await writeFile(MD_OUTPUT, md);
});
