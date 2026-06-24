import type { CurriculumItem } from "@/features/lessons/lesson.types";
import { Subject } from "@/types/lesson";

const CURRICULUM_FILES = {
	[Subject.ENGLISH]: "/curriculum/english.json",
	[Subject.MATH]: "/curriculum/mathematics.json",
	[Subject.ICT]: "/curriculum/ict.json",
} as const;

const STOP_WORDS = new Set([
	"a",
	"an",
	"and",
	"are",
	"as",
	"at",
	"be",
	"by",
	"for",
	"from",
	"in",
	"is",
	"it",
	"of",
	"on",
	"or",
	"the",
	"to",
	"use",
	"with",
]);

interface SearchDocument {
	item: CurriculumItem;
	topicTokens: string[];
	outcomeTokens: string[];
	summaryTokens: string[];
	keywords: string[];
	searchText: string;
}

interface ScoredDocument {
	item: CurriculumItem;
	evidenceScore: number;
	finalScore: number;
}

// Cache for loaded curriculum data and derived search documents.
const curriculumCache = new Map<string, CurriculumItem[]>();
const searchDocumentCache = new Map<string, SearchDocument[]>();

/**
 * Normalize text for OCR/curriculum matching.
 *
 * Sinhala and English notes commonly contain zero-width joiners, mixed Unicode
 * punctuation, and OCR spacing noise. We normalize those before token scoring.
 */
function normalizeForMatching(text: string): string {
	return text
		.toLowerCase()
		.normalize("NFC")
		.replace(/[\u200B-\u200D\uFEFF]/g, "")
		.replace(/[‐‑‒–—―]/g, "-")
		.replace(/[“”„‟]/g, '"')
		.replace(/[‘’‚‛]/g, "'")
		.replace(/\s+/g, " ")
		.trim();
}

function tokenize(text: string): string[] {
	const normalized = normalizeForMatching(text);
	const tokens = normalized.match(/[\p{L}\p{M}\p{N}]+/gu) ?? [];

	return tokens.filter((token) => {
		if (token.length < 2) return false;
		if (STOP_WORDS.has(token)) return false;
		return true;
	});
}

function uniqueTokens(text: string): string[] {
	return Array.from(new Set(tokenize(text)));
}

function flattenKeywords(keywords: CurriculumItem["keywords"]): string[] {
	if (Array.isArray(keywords)) {
		return keywords
			.flat(Infinity)
			.filter((value): value is string => typeof value === "string");
	}

	if (typeof keywords === "string") {
		return [keywords];
	}

	return [];
}

function buildSearchDocuments(items: CurriculumItem[]): SearchDocument[] {
	return items.map((item) => {
		const keywords = flattenKeywords(item.keywords);

		return {
			item,
			keywords,
			topicTokens: uniqueTokens(item.topic ?? ""),
			outcomeTokens: uniqueTokens(item.learning_outcome ?? ""),
			summaryTokens: uniqueTokens(item.content_summary ?? ""),
			searchText: normalizeForMatching(
				[item.topic, item.learning_outcome, item.content_summary, ...keywords]
					.filter(Boolean)
					.join(" "),
			),
		};
	});
}

function levenshtein(a: string, b: string): number {
	if (a === b) return 0;
	if (a.length === 0) return b.length;
	if (b.length === 0) return a.length;

	const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
	const current = Array.from({ length: b.length + 1 }, () => 0);

	for (let i = 1; i <= a.length; i++) {
		current[0] = i;
		for (let j = 1; j <= b.length; j++) {
			const substitutionCost = a[i - 1] === b[j - 1] ? 0 : 1;
			current[j] = Math.min(
				previous[j] + 1,
				current[j - 1] + 1,
				previous[j - 1] + substitutionCost,
			);
		}
		previous.splice(0, previous.length, ...current);
	}

	return previous[b.length];
}

function isSinhala(text: string): boolean {
	return /[\u0d80-\u0dff]/u.test(text);
}

function tokenSimilarity(queryToken: string, candidateToken: string): number {
	if (queryToken === candidateToken) return 1;

	const queryIsSinhala = isSinhala(queryToken);
	const candidateIsSinhala = isSinhala(candidateToken);

	if (queryIsSinhala && candidateIsSinhala) {
		if (
			candidateToken.startsWith(queryToken) &&
			candidateToken.length <= queryToken.length + 5
		) {
			return 0.92;
		}

		if (
			queryToken.startsWith(candidateToken) &&
			queryToken.length <= candidateToken.length + 5
		) {
			return 0.88;
		}
	}

	if (queryToken.length < 4 || candidateToken.length < 4) return 0;

	const maxDistance = Math.min(
		2,
		Math.floor(Math.min(queryToken.length, candidateToken.length) / 4),
	);
	if (Math.abs(queryToken.length - candidateToken.length) > maxDistance) {
		return 0;
	}

	const distance = levenshtein(queryToken, candidateToken);
	if (distance > maxDistance) return 0;

	return 1 - distance / Math.max(queryToken.length, candidateToken.length);
}

function bestTokenScore(token: string, textTokens: Set<string>): number {
	if (textTokens.has(token)) return 1;

	let best = 0;
	for (const textToken of textTokens) {
		best = Math.max(best, tokenSimilarity(token, textToken));
		if (best === 1) break;
	}

	return best;
}

function scoreTerm(
	term: string,
	textTokens: Set<string>,
	normalizedText: string,
): number {
	const normalizedTerm = normalizeForMatching(term);
	if (!normalizedTerm) return 0;

	const termTokens = uniqueTokens(normalizedTerm);
	if (termTokens.length === 0) return 0;

	if (normalizedText.includes(normalizedTerm)) {
		return 2.5 + Math.min(termTokens.length, 3) * 0.3;
	}

	const tokenScores = termTokens.map((token) =>
		bestTokenScore(token, textTokens),
	);
	const matchedScores = tokenScores.filter((score) => score >= 0.82);
	if (matchedScores.length === 0) return 0;

	const coverage =
		matchedScores.reduce((total, score) => total + score, 0) /
		termTokens.length;

	if (termTokens.length === 1) {
		return coverage >= 0.82 ? coverage * 2 : 0;
	}

	return coverage >= 0.4 ? coverage * 2.2 : 0;
}

function scoreTokenField(
	fieldTokens: string[],
	textTokens: Set<string>,
	weight: number,
	maxContribution: number,
): number {
	let score = 0;

	for (const token of fieldTokens) {
		const matchScore = bestTokenScore(token, textTokens);
		if (matchScore >= 0.86) {
			score += matchScore * weight;
		}
	}

	return Math.min(score, maxContribution);
}

function scoreDocument(
	document: SearchDocument,
	textTokens: Set<string>,
	normalizedText: string,
	grade?: number,
): ScoredDocument {
	let evidenceScore = 0;

	for (const keyword of document.keywords) {
		evidenceScore += scoreTerm(keyword, textTokens, normalizedText);
	}

	evidenceScore += scoreTokenField(document.topicTokens, textTokens, 1.4, 4.2);
	evidenceScore += scoreTokenField(
		document.summaryTokens,
		textTokens,
		0.45,
		2.25,
	);
	evidenceScore += scoreTokenField(
		document.outcomeTokens,
		textTokens,
		0.3,
		1.8,
	);

	if (normalizedText.includes(document.searchText) && document.searchText) {
		evidenceScore += 1;
	}

	if (evidenceScore < 0.8) {
		return { item: document.item, evidenceScore, finalScore: 0 };
	}

	let finalScore = evidenceScore;
	if (grade !== undefined) {
		const gradeDistance = Math.abs(Number(document.item.grade) - Number(grade));
		if (gradeDistance === 0) {
			finalScore = finalScore * 1.25 + 0.75;
		} else if (gradeDistance === 1) {
			finalScore = finalScore * 1.05;
		} else {
			finalScore = finalScore * 0.65;
		}
	}

	return { item: document.item, evidenceScore, finalScore };
}

async function loadCurriculum(subjects: Subject[]): Promise<CurriculumItem[]> {
	const allItems: CurriculumItem[] = [];

	for (const subject of subjects) {
		if (curriculumCache.has(subject)) {
			allItems.push(...(curriculumCache.get(subject) ?? []));
			continue;
		}

		const filePath = CURRICULUM_FILES[subject];
		if (!filePath) continue;

		try {
			let data: CurriculumItem[];
			if (typeof window === "undefined") {
				const fs = await import("node:fs");
				const path = await import("node:path");
				const absolutePath = path.join(process.cwd(), "public", filePath);
				const fileContent = fs.readFileSync(absolutePath, "utf8");
				data = JSON.parse(fileContent) as CurriculumItem[];
			} else {
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

async function loadSearchDocuments(
	subject: Subject,
): Promise<SearchDocument[]> {
	if (searchDocumentCache.has(subject)) {
		return searchDocumentCache.get(subject) ?? [];
	}

	const curriculumData = await loadCurriculum([subject]);
	const documents = buildSearchDocuments(curriculumData);
	searchDocumentCache.set(subject, documents);
	return documents;
}

/**
 * Find matching curriculum items based on OCR text.
 *
 * Content evidence is scored first, then grade is used only as a relevance
 * boost. This prevents the lesson form's selected grade from producing
 * same-grade false positives when the OCR text itself does not match.
 */
export async function findMatches(
	text: string,
	subject: Subject = Subject.ENGLISH,
	grade?: number,
): Promise<CurriculumItem[]> {
	if (!text || text.trim().length === 0) return [];

	try {
		const documents = await loadSearchDocuments(subject);
		if (documents.length === 0) return [];

		const normalizedText = normalizeForMatching(text);
		const textTokens = new Set(tokenize(text));
		if (textTokens.size === 0) return [];

		return documents
			.map((document) =>
				scoreDocument(document, textTokens, normalizedText, grade),
			)
			.filter((result) => result.finalScore > 0)
			.sort((a, b) => {
				if (b.finalScore !== a.finalScore) {
					return b.finalScore - a.finalScore;
				}
				return b.evidenceScore - a.evidenceScore;
			})
			.slice(0, 10)
			.map((result) => ({
				...result.item,
				score: Math.min(10, Number(result.finalScore.toFixed(2))),
			}));
	} catch (error) {
		console.error("Error finding matches:", error);
		return [];
	}
}

/**
 * Resolve an array of curriculum IDs to full CurriculumItem objects.
 * Useful for displaying linked learning outcomes in lessons.
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
 * Clear the curriculum cache. Useful for tests or after replacing curriculum
 * files during development.
 */
export function clearCurriculumCache(): void {
	curriculumCache.clear();
	searchDocumentCache.clear();
}
