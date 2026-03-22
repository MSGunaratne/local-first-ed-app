import type { CurriculumItem } from "@/features/lessons/lesson.types";
import { Subject } from "@/types/lesson";

const CURRICULUM_FILES = {
	[Subject.ENGLISH]: "/curriculum/english.json",
	[Subject.MATH]: "/curriculum/mathematics.json",
	[Subject.ICT]: "/curriculum/ict.json",
} as const;

// Cache for loaded curriculum data to avoid repeated fetches
const curriculumCache = new Map<string, CurriculumItem[]>();

/**
 * Normalize text for matching - critical for Sinhala Unicode support
 * Uses NFC normalization to handle composed vs decomposed Unicode forms
 */
function normalizeForMatching(text: string): string {
	return (
		text
			.toLowerCase()
			// NFC normalization - critical for Sinhala (සිංහල) Unicode
			.normalize("NFC")
			// Remove zero-width characters that can cause matching issues
			.replace(/[\u200B-\u200D\uFEFF]/g, "")
			// Normalize whitespace
			.replace(/\s+/g, " ")
			.trim()
	);
}

/**
 * Tokenize text for matching, preserving both English and Sinhala tokens
 */
function tokenize(text: string): Set<string> {
	const normalized = normalizeForMatching(text);
	// Split on whitespace and common punctuation, filter short tokens
	// Keep Sinhala characters intact (they're multi-byte but form words)
	const tokens = normalized
		.split(/[\s,.\-;:!?'"()[\]{}]+/)
		.filter((t) => t.length > 1); // Min 2 chars for Sinhala compatibility
	return new Set(tokens);
}

/**
 * Load curriculum data for specified subjects (with caching)
 */
async function loadCurriculum(subjects: Subject[]): Promise<CurriculumItem[]> {
	const allItems: CurriculumItem[] = [];

	for (const subject of subjects) {
		// Check cache first
		if (curriculumCache.has(subject)) {
			allItems.push(...(curriculumCache.get(subject) ?? []));
			continue;
		}

		const filePath = CURRICULUM_FILES[subject];
		if (!filePath) continue;

		try {
			const response = await fetch(filePath);
			if (!response.ok) {
				console.warn(`Failed to load curriculum: ${filePath}`);
				continue;
			}
			const data = (await response.json()) as CurriculumItem[];
			curriculumCache.set(subject, data);
			allItems.push(...data);
		} catch (error) {
			console.error(`Error loading curriculum ${subject}:`, error);
		}
	}

	return allItems;
}

/**
 * Find matching curriculum items based on OCR text
 * Supports both English and Sinhala keywords with proper Unicode handling
 *
 * @param text - OCR extracted text (can contain English and/or Sinhala)
 * @param subject - Subject to search in (defaults to English)
 * @returns Top matching curriculum items sorted by score
 */
export async function findMatches(
	text: string,
	subject: Subject = Subject.ENGLISH,
): Promise<CurriculumItem[]> {
	if (!text || text.trim().length === 0) return [];

	try {
		const curriculumData = await loadCurriculum([subject]);
		if (curriculumData.length === 0) return [];

		const normalizedText = normalizeForMatching(text);
		const textTokens = tokenize(text);

		const scoredItems = curriculumData.map((item) => {
			let score = 0;

			// Keyword Matching (High Priority - 3 points per match)
			for (const keyword of item.keywords) {
				if (typeof keyword !== "string") continue;
				const normalizedKeyword = normalizeForMatching(keyword);

				// Exact token match
				if (textTokens.has(normalizedKeyword)) {
					score += 3;
				}
				// Substring match (for compound words / phrases)
				else if (normalizedText.includes(normalizedKeyword)) {
					score += 2;
				}
			}

			// Topic Matching (Medium Priority - 2 points per word)
			if (item.topic && typeof item.topic === "string") {
				const topicTokens = tokenize(item.topic);
				for (const word of topicTokens) {
					if (textTokens.has(word)) {
						score += 2;
					}
				}
			}

			// Learning Outcome Matching (Low Priority - 1 point per word)
			if (item.learning_outcome && typeof item.learning_outcome === "string") {
				const outcomeTokens = tokenize(item.learning_outcome);
				let outcomeMatches = 0;
				for (const word of outcomeTokens) {
					if (textTokens.has(word) && word.length > 3) {
						outcomeMatches++;
					}
				}
				// Cap learning outcome contribution to avoid noise
				score += Math.min(outcomeMatches, 3);
			}

			return { ...item, score };
		});

		// Filter out zero scores and sort by score descending
		return scoredItems
			.filter((item) => (item.score ?? 0) > 0)
			.sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
			.slice(0, 10); // Return top 10 matches
	} catch (error) {
		console.error("Error finding matches:", error);
		return [];
	}
}

/**
 * Resolve an array of curriculum IDs to full CurriculumItem objects
 * Useful for displaying linked learning outcomes in lessons
 */
export async function resolveCurriculumIds(
	ids: string[],
	subjects?: Subject[],
): Promise<CurriculumItem[]> {
	if (!ids || ids.length === 0) return [];

	const subjectsToSearch = subjects ?? [
		Subject.ENGLISH,
		Subject.MATH,
		Subject.ICT,
	];

	const curriculumData = await loadCurriculum(subjectsToSearch);
	const idSet = new Set(ids);

	return curriculumData.filter((item) => idSet.has(item.id));
}

/**
 * Clear the curriculum cache (useful for testing or when files change)
 */
export function clearCurriculumCache(): void {
	curriculumCache.clear();
}
