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
/**
 * Compute the Levenshtein distance between two strings to check for typos/OCR noise.
 */
function levenshtein(a: string, b: string): number {
	const matrix: number[][] = [];
	for (let i = 0; i <= b.length; i++) {
		matrix[i] = [i];
	}
	for (let j = 0; j <= a.length; j++) {
		matrix[0][j] = j;
	}
	for (let i = 1; i <= b.length; i++) {
		for (let j = 1; j <= a.length; j++) {
			if (b.charAt(i - 1) === a.charAt(j - 1)) {
				matrix[i][j] = matrix[i - 1][j - 1];
			} else {
				matrix[i][j] = Math.min(
					matrix[i - 1][j - 1] + 1, // substitution
					matrix[i][j - 1] + 1, // insertion
					matrix[i - 1][j] + 1, // deletion
				);
			}
		}
	}
	return matrix[b.length][a.length];
}

/**
 * Perform intelligent matching of a curriculum keyword against OCR tokens and text.
 * Tailored for Sinhala suffix variations and English typos.
 */
function calculateKeywordScore(
	keyword: string,
	textTokens: Set<string>,
	normalizedText: string,
): { matched: boolean; score: number } {
	const normKeyword = normalizeForMatching(keyword);
	if (!normKeyword || normKeyword.length < 2)
		return { matched: false, score: 0 };

	// 1. Exact match of the entire keyword phrase
	if (textTokens.has(normKeyword) || normalizedText.includes(normKeyword)) {
		return { matched: true, score: 3.0 };
	}

	// 2. Tokenize the keyword to handle multi-word keywords (e.g. "පරිගණක ලක්ෂණ")
	const kwTokens = Array.from(tokenize(normKeyword));
	if (kwTokens.length > 1) {
		let matchCount = 0;
		let totalScore = 0;
		for (const kwToken of kwTokens) {
			const subMatch = calculateKeywordScore(
				kwToken,
				textTokens,
				normalizedText,
			);
			if (subMatch.matched) {
				matchCount++;
				totalScore += subMatch.score;
			}
		}
		// If at least one main word of a multi-word keyword is matched, return a score
		if (matchCount > 0) {
			// Weight the score by fraction of matched words
			return { matched: true, score: (totalScore / kwTokens.length) * 1.2 };
		}
	}

	// 3. Sinhala suffix check
	// Sinhala words append inflections (e.g. "පරිගණකය" starts with "පරිගණක")
	const isSinhala = /[\u0d80-\u0dff]/.test(normKeyword);
	for (const token of textTokens) {
		if (isSinhala) {
			if (
				token.startsWith(normKeyword) &&
				token.length <= normKeyword.length + 4
			) {
				return { matched: true, score: 2.5 }; // Suffix match
			}
			if (
				normKeyword.startsWith(token) &&
				normKeyword.length <= token.length + 3
			) {
				return { matched: true, score: 2.2 }; // Truncated suffix match
			}
		}
	}

	// 4. Typo / OCR noise tolerance using Levenshtein distance
	if (normKeyword.length >= 4) {
		for (const token of textTokens) {
			const maxDistance = Math.min(
				2,
				Math.floor(Math.min(normKeyword.length, token.length) / 3),
			);
			if (Math.abs(normKeyword.length - token.length) <= maxDistance) {
				if (levenshtein(normKeyword, token) <= maxDistance) {
					return { matched: true, score: 2.2 }; // Similar token match
				}
			}
		}
	}

	return { matched: false, score: 0 };
}

/**
 * Load curriculum data for specified subjects (with caching)
 * Supports server-side (Node/Vitest) local file access as fallback
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
			let data: CurriculumItem[];
			if (typeof window === "undefined") {
				// Server-side / Node / Vitest: load directly from public folder using fs
				const fs = await import("node:fs");
				const path = await import("node:path");
				const absolutePath = path.join(process.cwd(), "public", filePath);
				const fileContent = fs.readFileSync(absolutePath, "utf8");
				data = JSON.parse(fileContent) as CurriculumItem[];
			} else {
				// Client-side: use standard fetch
				const response = await fetch(filePath);
				if (!response.ok) {
					console.warn(`Failed to load curriculum: ${filePath}`);
					continue;
				}
				data = (await response.json()) as CurriculumItem[];
			}

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
 * Supports both English and Sinhala keywords with proper Unicode handling,
 * typo tolerance, and grade relevance boosting.
 *
 * @param text - OCR extracted text (can contain English and/or Sinhala)
 * @param subject - Subject to search in (defaults to English)
 * @param grade - Grade level of target lesson (adds selection priority boost)
 * @returns Top matching curriculum items sorted by score
 */
export async function findMatches(
	text: string,
	subject: Subject = Subject.ENGLISH,
	grade?: number,
): Promise<CurriculumItem[]> {
	if (!text || text.trim().length === 0) return [];

	try {
		const curriculumData = await loadCurriculum([subject]);
		if (curriculumData.length === 0) return [];

		const normalizedText = normalizeForMatching(text);
		const textTokens = tokenize(text);

		const scoredItems = curriculumData.map((item) => {
			let score = 0;

			// Extract and flatten keywords dynamically (supports flat/nested configurations)
			let flatKeywords: string[] = [];
			if (Array.isArray(item.keywords)) {
				const flatten = (arr: unknown[]) => {
					for (const val of arr) {
						if (Array.isArray(val)) {
							flatten(val);
						} else if (typeof val === "string") {
							flatKeywords.push(val);
						}
					}
				};
				flatten(item.keywords);
			} else if (typeof item.keywords === "string") {
				flatKeywords = [item.keywords];
			}

			// Keyword Matching (High Priority - weights up to 3 points per match)
			for (const keyword of flatKeywords) {
				const matchInfo = calculateKeywordScore(
					keyword,
					textTokens,
					normalizedText,
				);
				if (matchInfo.matched) {
					score += matchInfo.score;
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

			// Grade boost (increases curation relevance)
			if (grade !== undefined && Number(item.grade) === Number(grade)) {
				score += 5; // Major boost for correct grade
			} else if (
				grade !== undefined &&
				Math.abs(Number(item.grade) - Number(grade)) === 1
			) {
				score += 1.5; // Minor boost for adjacent grade
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
