import { describe, expect, it } from "vitest";
import { Subject } from "@/types/lesson";
import { chooseSubjectRecommendation, findMatches } from "./content-mapper";

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

	it("finds ICT matches by curriculum terms", async () => {
		const matches = await findMatches(
			"embedded systems processing reliability computer characteristics",
			Subject.ICT,
			6,
		);

		expect(matches.length).toBeGreaterThan(0);
		expect(matches[0].id).toBe("ICT-GR6-1.1");
	});

	it("finds mathematics matches for number line concepts", async () => {
		const matches = await findMatches(
			"negative numbers integers zero on the number line",
			Subject.MATH,
			6,
		);

		expect(matches.length).toBeGreaterThan(0);
		expect(matches[0].id).toBe("MAT-GR6-1.2");
	});

	it("does not return matches for OCR noise without curriculum evidence", async () => {
		const matches = await findMatches(
			"@@@ xqz 123 random smudged camera shadow",
			Subject.ENGLISH,
			6,
		);

		expect(matches).toHaveLength(0);
	});

	it("recommends a clearly stronger subject only when the current subject is weak", () => {
		expect(
			chooseSubjectRecommendation(Subject.MATH, {
				[Subject.MATH]: 1.2,
				[Subject.ENGLISH]: 0.8,
				[Subject.ICT]: 6.4,
			}),
		).toMatchObject({ subject: Subject.ICT, currentScore: 1.2, score: 6.4 });

		expect(
			chooseSubjectRecommendation(Subject.MATH, {
				[Subject.MATH]: 4.1,
				[Subject.ENGLISH]: 0.5,
				[Subject.ICT]: 5.8,
			}),
		).toBeNull();
	});
});
