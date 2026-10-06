import { getSchema } from "@tiptap/core";
import { TableKit } from "@tiptap/extension-table";
import StarterKit from "@tiptap/starter-kit";
import { describe, expect, it } from "vitest";
import {
	cleanOcrText,
	detectOcrTableCandidates,
	detectTextTableCandidates,
	filterReliableOcrText,
	isLikelyOcrNoiseLine,
	mergeOcrLineCandidates,
	mergeSpatialLineFragments,
	normalizeOcrTextForComparison,
	ocrTextToTiptapBlocks,
	repairSubjectOcrLine,
} from "./ocr-postprocess";

describe("OCR post-processing", () => {
	it("drops symbol-only and weak isolated fragments without deleting maths", () => {
		expect(isLikelyOcrNoiseLine("_|_~~", 12)).toBe(true);
		expect(isLikelyOcrNoiseLine("x + 5 = 10", 12)).toBe(false);
		expect(isLikelyOcrNoiseLine("CPU", 12, "sin")).toBe(false);
		expect(isLikelyOcrNoiseLine("Q", 12, "sin")).toBe(true);
		expect(isLikelyOcrNoiseLine("2", 48)).toBe(true);
		expect(
			isLikelyOcrNoiseLine("2", 48, "eng+sin", {
				preserveStandaloneNumbers: true,
			}),
		).toBe(false);
	});

	it("drops a weak minority-script line on an otherwise Latin page", () => {
		const result = filterReliableOcrText(
			[
				[{ text: "Central Processing Unit", confidence: 90 }],
				[{ text: "තක ෂූ", confidence: 27 }],
				[{ text: "The CPU processes instructions", confidence: 85 }],
			],
			"eng+sin",
		);
		expect(result.text).not.toContain("තක");
		expect(result.removedLineCount).toBe(1);
	});

	it("uses confidence only with noise shape and keeps paragraph boundaries", () => {
		const result = filterReliableOcrText(
			[
				[
					{ text: "1. First question", confidence: 82 },
					{ text: "|_~", confidence: 8 },
				],
				[{ text: "CPU means Central Processing Unit", confidence: 32 }],
			],
			"eng+sin",
		);

		expect(result.text).toBe(
			"1. First question\n\nCPU means Central Processing Unit",
		);
		expect(result.removedLineCount).toBe(1);
		expect(result.totalLineCount).toBe(3);
	});

	it("repairs ordered and bullet lists as native Tiptap nodes", () => {
		const nodes = ocrTextToTiptapBlocks(
			"II. Draw the picture\nIII. Name the output\n\n• Input\n- Output",
		);

		expect(nodes).toEqual([
			{
				type: "orderedList",
				attrs: { start: 2, type: "I" },
				content: [
					{
						type: "listItem",
						content: [
							{
								type: "paragraph",
								content: [{ type: "text", text: "Draw the picture" }],
							},
						],
					},
					{
						type: "listItem",
						content: [
							{
								type: "paragraph",
								content: [{ type: "text", text: "Name the output" }],
							},
						],
					},
				],
			},
			{
				type: "bulletList",
				content: [
					{
						type: "listItem",
						content: [
							{
								type: "paragraph",
								content: [{ type: "text", text: "Input" }],
							},
						],
					},
					{
						type: "listItem",
						content: [
							{
								type: "paragraph",
								content: [{ type: "text", text: "Output" }],
							},
						],
					},
				],
			},
		]);
	});

	it("keeps blank-separated list items valid for the app's Tiptap schema", () => {
		const nodes = ocrTextToTiptapBlocks("1. First item\n\n2. Second item");
		const document = getSchema([StarterKit]).nodeFromJSON({
			type: "doc",
			content: nodes,
		});

		expect(() => document.check()).not.toThrow();
		expect(document.firstChild?.type.name).toBe("orderedList");
		expect(document.textContent).toBe("First itemSecond item");
		expect(JSON.stringify(nodes)).not.toMatch(/confidence|bbox|raw/i);
	});

	it("flattens consistent table rows and removes border fragments", () => {
		const text = [
			"Masculine   Feminine",
			"father      mother",
			"brother     sister",
			"|~~~~|",
		].join("\n");
		const nodes = ocrTextToTiptapBlocks(text);

		expect(nodes).toEqual([
			{
				type: "paragraph",
				content: [{ type: "text", text: "Masculine — Feminine" }],
			},
			{
				type: "paragraph",
				content: [{ type: "text", text: "father — mother" }],
			},
			{
				type: "paragraph",
				content: [{ type: "text", text: "brother — sister" }],
			},
		]);
	});

	it("creates native compact table nodes only when a candidate is selected", () => {
		const text = [
			"Masculine   Feminine",
			"father      mother",
			"brother     sister",
		].join("\n");
		const [candidate] = detectTextTableCandidates(text);
		const nodes = ocrTextToTiptapBlocks(text, "eng", {
			tableCandidates: [candidate],
			tableSelections: [{ candidateId: candidate.id }],
		});
		const document = getSchema([StarterKit, TableKit]).nodeFromJSON({
			type: "doc",
			content: nodes,
		});

		expect(nodes[0]?.type).toBe("table");
		expect(nodes[0]?.content).toHaveLength(3);
		expect(nodes[0]?.content?.[0]?.content?.[0]?.type).toBe("tableCell");
		expect(() => document.check()).not.toThrow();
		expect(JSON.stringify(nodes)).not.toMatch(
			/confidence|bbox|layoutScore|sourceText|raw/i,
		);
	});

	it("auto-converts only stable spatial tables with three or more rows", () => {
		const rows = mergeSpatialLineFragments(
			[0, 1, 2].flatMap((row) => [
				{
					text: `Left ${row + 1}`,
					confidence: 86,
					bbox: { x0: 100, y0: 100 + row * 50, x1: 300, y1: 130 + row * 50 },
				},
				{
					text: `Right ${row + 1}`,
					confidence: 84,
					bbox: { x0: 650, y0: 101 + row * 50, x1: 850, y1: 131 + row * 50 },
				},
			]),
			1000,
		);
		const [candidate] = detectOcrTableCandidates(rows, 1000);

		expect(candidate.rows).toHaveLength(3);
		expect(candidate.hasSpatialEvidence).toBe(true);
		expect(candidate.autoConvert).toBe(true);
		expect(candidate.confidence).toBeGreaterThanOrEqual(65);
	});

	it("keeps two-row and text-only layouts behind teacher confirmation", () => {
		const [candidate] = detectTextTableCandidates(
			"Input   Output\nKeyboard   Letters",
		);
		expect(candidate.rows).toHaveLength(2);
		expect(candidate.hasSpatialEvidence).toBe(false);
		expect(candidate.autoConvert).toBe(false);
	});

	it("does not mistake symbol-heavy Sinhala maths fragments for tables", () => {
		const candidates = detectTextTableCandidates(
			"॥   ෴\n1   -1\n~~   //\n[!   |",
		);
		expect(candidates).toEqual([]);
	});

	it("keeps an eighty-cell table under the compact JSON budget", () => {
		const text = Array.from({ length: 20 }, (_, row) =>
			Array.from(
				{ length: 4 },
				(_, column) => `R${row + 1}C${column + 1}`,
			).join("   "),
		).join("\n");
		const [candidate] = detectTextTableCandidates(text);
		const nodes = ocrTextToTiptapBlocks(text, "eng", {
			tableCandidates: [candidate],
			tableSelections: [{ candidateId: candidate.id }],
		});
		expect(JSON.stringify(nodes).length).toBeLessThan(16_000);
	});

	it("preserves Sinhala, English ICT terms, and compact comparison semantics", () => {
		const cleaned = cleanOcrText("පරිගණකය CPU\n\n|~~|");
		expect(cleaned).toBe("පරිගණකය CPU");
		expect(normalizeOcrTextForComparison("1. CPU input")).toBe(
			normalizeOcrTextForComparison("CPU input"),
		);
	});

	it("merges complementary PSM results and spatial table cells", () => {
		const merged = mergeOcrLineCandidates([
			[
				{
					text: "3. That woman can sing well.",
					confidence: 94,
					bbox: { x0: 100, y0: 300, x1: 700, y1: 330 },
					source: "sparse",
				},
			],
			[
				{
					text: "Masculine",
					confidence: 90,
					bbox: { x0: 100, y0: 100, x1: 300, y1: 130 },
				},
				{
					text: "Feminine",
					confidence: 92,
					bbox: { x0: 700, y0: 101, x1: 900, y1: 131 },
				},
			],
		]);
		const rows = mergeSpatialLineFragments(merged, 1000);
		expect(rows.flat().map((line) => line.text)).toEqual([
			"Masculine   Feminine",
			"3. That woman can sing well.",
		]);
	});

	it("quarantines illustration fragments and allows conservative subject repairs", () => {
		const filtered = filterReliableOcrText(
			[
				[
					{
						text: "_%*: 2",
						confidence: 49,
						regionStats: {
							saturatedFraction: 0.25,
							darkFraction: 0.2,
							edgeFraction: 0.25,
						},
					},
				],
			],
			"sin",
		);
		expect(filtered.text).toBe("");
		expect(filtered.uncertainText).toContain("2");
		expect(filtered.uncertainLineCount).toBe(1);

		expect(
			repairSubjectOcrLine(
				{ text: "Central Procesing Unit", confidence: 65 },
				"ict",
			).text,
		).toBe("Central Processing Unit");
		expect(
			repairSubjectOcrLine(
				{ text: "Are not — Aren’+", confidence: 60 },
				"english",
			).text,
		).toContain("Aren't");
	});
});
