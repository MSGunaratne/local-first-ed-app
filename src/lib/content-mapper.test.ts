import { describe, expect, it } from "vitest";
import { findMatches } from "./content-mapper";
import { Subject } from "@/types/lesson";

describe("Content Mapper Matching Logic", () => {
	it("should find matches by exact keywords in English", async () => {
		const matches = await findMatches(
			"vowels and consonants pronunciation",
			Subject.ENGLISH,
		);
		expect(matches.length).toBeGreaterThan(0);
		// Check that the first match is the Pronunciation Basics item
		const firstMatch = matches[0];
		expect(firstMatch.id).toBe("ENG-GR6-1.1");
	});

	it("should find matches by exact keywords in Sinhala", async () => {
		const matches = await findMatches("උච්චාරණය ස්වර", Subject.ENGLISH);
		expect(matches.length).toBeGreaterThan(0);
		const firstMatch = matches[0];
		expect(firstMatch.id).toBe("ENG-GR6-1.1");
	});

	it("should find matches with Sinhala inflected suffixes (fuzzy matching)", async () => {
		// Keyword in curriculum: "පරිගණක" (Computer)
		// Input text with suffix: "පරිගණකයෙන් ලැබෙන ප්‍රයෝජන" (Benefits from computer)
		const matches = await findMatches("පරිගණකයෙන් ලැබෙන ප්‍රයෝජන", Subject.ICT);
		expect(matches.length).toBeGreaterThan(0);

		// The first match should contain computer characteristics or components
		const matchIds = matches.map((m) => m.id);
		expect(matchIds).toContain("ICT-GR6-1.1");
	});

	it("should handle typos or OCR noise using token similarity", async () => {
		// "Proonunciation" instead of "Pronunciation"
		const matches = await findMatches("Proonunciation Basics", Subject.ENGLISH);
		expect(matches.length).toBeGreaterThan(0);
		expect(matches[0].id).toBe("ENG-GR6-1.1");
	});
});
