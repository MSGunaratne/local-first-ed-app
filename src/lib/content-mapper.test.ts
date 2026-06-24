import { describe, expect, it } from "vitest";
import { Subject } from "@/types/lesson";
import { findMatches } from "./content-mapper";

describe("Content Mapper Matching Logic", () => {
	it("finds matches by exact keywords in English", async () => {
		const matches = await findMatches(
			"vowels and consonants pronunciation",
			Subject.ENGLISH,
		);

		expect(matches.length).toBeGreaterThan(0);
		expect(matches[0].id).toBe("ENG-GR6-1.1");
	});

	it("finds matches by exact keywords in Sinhala", async () => {
		const matches = await findMatches("උච්චාරණය ස්වර", Subject.ENGLISH);

		expect(matches.length).toBeGreaterThan(0);
		expect(matches[0].id).toBe("ENG-GR6-1.1");
	});

	it("finds matches with Sinhala inflected suffixes", async () => {
		const matches = await findMatches("පරිගණකයෙන් ලැබෙන ප්‍රයෝජන", Subject.ICT);

		expect(matches.length).toBeGreaterThan(0);
		expect(matches.map((match) => match.id)).toContain("ICT-GR6-1.1");
	});

	it("handles typos or OCR noise using token similarity", async () => {
		const matches = await findMatches("Proonunciation Basics", Subject.ENGLISH);

		expect(matches.length).toBeGreaterThan(0);
		expect(matches[0].id).toBe("ENG-GR6-1.1");
	});

	it("does not return same-grade matches without content evidence", async () => {
		const matches = await findMatches(
			"rainforest cooking music",
			Subject.MATH,
			6,
		);

		expect(matches).toHaveLength(0);
	});

	it("uses grade as a boost only after a content match exists", async () => {
		const matches = await findMatches(
			"place value standard form",
			Subject.MATH,
			6,
		);

		expect(matches.length).toBeGreaterThan(0);
		expect(matches[0].id).toBe("MAT-GR6-1.1");
	});
});
