import type { JSONContent } from "@tiptap/core";
import type {
	OcrBoundingBox,
	OcrRegionStats,
} from "@/lib/ocr-image-normalization";

export interface OcrWordCandidate {
	text: string;
	confidence: number;
	bbox?: OcrBoundingBox;
}

export interface OcrLineCandidate {
	text: string;
	confidence: number;
	bbox?: OcrBoundingBox;
	words?: OcrWordCandidate[];
	/** Transient same-row fragments used for layout reconstruction. Never persisted. */
	layoutFragments?: OcrWordCandidate[];
	blockType?: number;
	regionStats?: OcrRegionStats;
	source?: "auto" | "sparse" | "language" | "single-line";
}

export interface OcrTableCandidate {
	id: string;
	rows: string[][];
	sourceText: string;
	confidence: number;
	layoutScore: number;
	hasSpatialEvidence: boolean;
	autoConvert: boolean;
}

export interface OcrTableSelection {
	candidateId: string;
	withHeaderRow?: boolean;
}

export interface OcrTextToTiptapOptions {
	tableCandidates?: readonly OcrTableCandidate[];
	tableSelections?: readonly OcrTableSelection[];
}

export interface OcrInsertionOptions extends OcrTextToTiptapOptions {
	language?: string;
}

export interface FilteredOcrText {
	text: string;
	uncertainText: string;
	removedLineCount: number;
	uncertainLineCount: number;
	totalLineCount: number;
}

interface OcrFilterOptions {
	preserveStandaloneNumbers?: boolean;
	pageWidth?: number;
	pageHeight?: number;
}

const CONTENT_CHARACTER = /[\p{L}\p{N}\p{M}]/u;
const CONTENT_CHARACTERS = /[\p{L}\p{N}\p{M}]/gu;
const BULLET_MARKER = /^[-•●◦▪▫‣⁃*+]\s+/u;
const ORDERED_MARKER =
	/^\s*(\d{1,3}|[IVXLCDM]{1,7}|[ivxlcdm]{1,7}|[A-Ha-h])[.)]\s+(.+)$/u;
const BULLET_PREFIXES = /^[-•●◦▪▫‣⁃*+]\s+/gmu;
const ORDERED_PREFIXES =
	/^\s*(?:\d{1,3}|[IVXLCDM]{1,7}|[ivxlcdm]{1,7}|[A-Ha-h])[.)]\s+/gmu;

function contentCharacterCount(value: string) {
	return value.match(CONTENT_CHARACTERS)?.length ?? 0;
}

function nonWhitespaceCharacterCount(value: string) {
	return Array.from(value).filter((character) => !/\s/u.test(character)).length;
}

function normalizeOcrLine(value: string) {
	const normalized = value
		.normalize("NFC")
		.replace(/\p{Cc}/gu, (character) => (character === "\t" ? " " : ""))
		.replace(/\uFEFF/gu, "")
		.replace(/\uFFFD/gu, "")
		.replace(/^[|¦‖]+\s*/u, "")
		.replace(/\s*[|¦‖]+$/u, "")
		.replace(/([_~=])\1{2,}/gu, " ")
		.replace(/^[●◦▪▫‣⁃]\s*/u, "• ")
		.replace(/[ \t]+/gu, (spacing) => (spacing.length >= 3 ? "   " : " "))
		.trim();
	// Tesseract commonly reads roman II/III as 11/111 on Sinhala worksheets.
	if (/^[\u0D80-\u0DFF\s]+$/u.test(normalized.replace(/^1{2,3}[.)]\s*/u, ""))) {
		return normalized
			.replace(/^111([.)])\s*/u, "III$1 ")
			.replace(/^11([.)])\s*/u, "II$1 ");
	}
	return normalized;
}

const SUBJECT_LEXICONS: Record<string, readonly string[]> = {
	english: [
		"apostrophe",
		"omission",
		"contraction",
		"negative",
		"question",
		"aren't",
		"isn't",
		"don't",
		"shouldn't",
		"I'm",
		"you're",
		"he's",
		"she's",
		"it's",
		"we're",
		"who's",
		"here's",
		"let's",
		"that's",
		"there's",
		"they're",
		"masculine",
		"feminine",
	],
	ict: [
		"Central",
		"Processing",
		"Unit",
		"CPU",
		"ALU",
		"Arithmetic",
		"Logical",
		"Control",
		"Memory",
		"Register",
		"motherboard",
		"instructions",
		"data",
		"digital",
		"circuit",
		"components",
		"function",
		"location",
	],
	math: ["angle", "angles", "triangle", "quadrilateral", "parallel", "degrees"],
};

function editDistance(left: string, right: string) {
	const previous = Array.from(
		{ length: right.length + 1 },
		(_, index) => index,
	);
	for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
		const current = [leftIndex];
		for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
			current[rightIndex] = Math.min(
				current[rightIndex - 1] + 1,
				previous[rightIndex] + 1,
				previous[rightIndex - 1] +
					(left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
			);
		}
		previous.splice(0, previous.length, ...current);
	}
	return previous[right.length];
}

/** Low-confidence, unique-nearest curriculum terms only; never free-form autocorrect. */
export function repairSubjectOcrLine(
	line: OcrLineCandidate,
	subject?: string,
): OcrLineCandidate {
	const lexicon = subject ? SUBJECT_LEXICONS[subject] : undefined;
	if (!lexicon || line.confidence >= 82) return line;
	let text = normalizeOcrLine(line.text);
	text = text
		.replace(/[’‘`´]t\b/giu, "'t")
		.replace(/\b([A-Za-z]+)[’‘`]\s*\+/gu, "$1't");
	text = text.replace(/\b5%\b/gu, "5x").replace(/\bAPc\b/gu, "APC");

	const repaired = text.replace(/[A-Za-z][A-Za-z'’]{2,}/gu, (token) => {
		const plain = token.toLocaleLowerCase().replace(/[’]/gu, "'");
		const maximum = plain.length >= 8 ? 2 : 1;
		const candidates = lexicon
			.map((term) => ({
				term,
				distance: editDistance(plain, term.toLocaleLowerCase()),
			}))
			.filter((candidate) => candidate.distance <= maximum)
			.sort((left, right) => left.distance - right.distance);
		if (
			candidates.length === 0 ||
			candidates[1]?.distance === candidates[0].distance
		)
			return token;
		const replacement = candidates[0].term;
		return /^[A-Z]/u.test(token) && /^[a-z]/u.test(replacement)
			? `${replacement[0].toUpperCase()}${replacement.slice(1)}`
			: replacement;
	});
	return repaired === line.text ? line : { ...line, text: repaired };
}

function bboxIntersectionRatio(left?: OcrBoundingBox, right?: OcrBoundingBox) {
	if (!left || !right) return 0;
	const width = Math.max(
		0,
		Math.min(left.x1, right.x1) - Math.max(left.x0, right.x0),
	);
	const height = Math.max(
		0,
		Math.min(left.y1, right.y1) - Math.max(left.y0, right.y0),
	);
	const intersection = width * height;
	const smallerArea = Math.min(
		Math.max(1, (left.x1 - left.x0) * (left.y1 - left.y0)),
		Math.max(1, (right.x1 - right.x0) * (right.y1 - right.y0)),
	);
	return intersection / smallerArea;
}

function comparisonKey(value: string) {
	return value
		.normalize("NFC")
		.toLocaleLowerCase()
		.replace(/[\p{P}\p{S}\s]+/gu, "");
}

function lineQuality(line: OcrLineCandidate) {
	const text = normalizeOcrLine(line.text);
	const content = contentCharacterCount(text);
	const visible = Math.max(1, nonWhitespaceCharacterCount(text));
	return (
		line.confidence + Math.min(12, content / 2) - (1 - content / visible) * 25
	);
}

/** Merge AUTO, sparse-text and language-refinement output without duplicating lines. */
export function mergeOcrLineCandidates(
	passes: readonly (readonly OcrLineCandidate[])[],
): OcrLineCandidate[] {
	const merged: OcrLineCandidate[] = [];
	for (const line of passes.flat()) {
		const normalized = normalizeOcrLine(line.text);
		if (!normalized) continue;
		const key = comparisonKey(normalized);
		const duplicateIndex = merged.findIndex((candidate) => {
			const candidateKey = comparisonKey(candidate.text);
			return (
				(key.length >= 4 && key === candidateKey) ||
				(bboxIntersectionRatio(line.bbox, candidate.bbox) >= 0.7 &&
					(key.includes(candidateKey) || candidateKey.includes(key)))
			);
		});
		if (duplicateIndex < 0) {
			merged.push({ ...line, text: normalized });
		} else {
			const existingKey = comparisonKey(merged[duplicateIndex].text);
			if (
				(key.includes(existingKey) && key.length > existingKey.length) ||
				(!existingKey.includes(key) &&
					lineQuality(line) > lineQuality(merged[duplicateIndex]) + 2)
			) {
				merged[duplicateIndex] = { ...line, text: normalized };
			}
		}
	}
	return merged.sort(
		(a, b) =>
			(a.bbox?.y0 ?? Number.MAX_SAFE_INTEGER) -
				(b.bbox?.y0 ?? Number.MAX_SAFE_INTEGER) ||
			(a.bbox?.x0 ?? 0) - (b.bbox?.x0 ?? 0),
	);
}

/** Rejoins sparse PSM cells/markers on the same visual row using compact text gaps. */
export function mergeSpatialLineFragments(
	lines: readonly OcrLineCandidate[],
	pageWidth = 2000,
): OcrLineCandidate[][] {
	const positioned = lines.filter((line) => line.bbox);
	const unpositioned = lines.filter((line) => !line.bbox).map((line) => [line]);
	const rows: OcrLineCandidate[][] = [];
	for (const line of positioned) {
		if (isLikelyIllustrationFragment(line)) {
			rows.push([line]);
			continue;
		}
		const bbox = line.bbox as OcrBoundingBox;
		const height = Math.max(1, bbox.y1 - bbox.y0);
		const center = (bbox.y0 + bbox.y1) / 2;
		const row = rows.find((candidate) => {
			const boxes = candidate.map((item) => item.bbox as OcrBoundingBox);
			const rowTop = Math.min(...boxes.map((item) => item.y0));
			const rowBottom = Math.max(...boxes.map((item) => item.y1));
			const rowCenter = (rowTop + rowBottom) / 2;
			return (
				Math.abs(center - rowCenter) <=
				Math.max(8, Math.min(height, rowBottom - rowTop) * 0.55)
			);
		});
		if (row) row.push(line);
		else rows.push([line]);
	}
	for (const row of rows)
		row.sort((a, b) => (a.bbox?.x0 ?? 0) - (b.bbox?.x0 ?? 0));
	rows.sort((a, b) => (a[0].bbox?.y0 ?? 0) - (b[0].bbox?.y0 ?? 0));

	return [...rows, ...unpositioned].map((row) => {
		if (row.length < 2) return row;
		const result: OcrLineCandidate[] = [];
		for (const fragment of row) {
			const overlapping = result.find(
				(candidate) =>
					bboxIntersectionRatio(candidate.bbox, fragment.bbox) > 0.5,
			);
			if (!overlapping) result.push(fragment);
			else if (lineQuality(fragment) > lineQuality(overlapping))
				result[result.indexOf(overlapping)] = fragment;
		}
		if (result.length < 2) return result;
		const first = result[0];
		let text = normalizeOcrLine(first.text);
		let previous = first.bbox as OcrBoundingBox;
		for (const fragment of result.slice(1)) {
			const bbox = fragment.bbox as OcrBoundingBox;
			const gap = bbox.x0 - previous.x1;
			text += `${gap > pageWidth * 0.035 ? "   " : " "}${normalizeOcrLine(fragment.text)}`;
			previous = bbox;
		}
		return [
			{
				...first,
				text,
				layoutFragments: result.map(({ text, confidence, bbox }) => ({
					text: normalizeOcrLine(text),
					confidence,
					bbox,
				})),
				confidence: Math.round(
					result.reduce((sum, item) => sum + item.confidence, 0) /
						result.length,
				),
				bbox: {
					x0: Math.min(...result.map((item) => item.bbox?.x0 ?? 0)),
					y0: Math.min(...result.map((item) => item.bbox?.y0 ?? 0)),
					x1: Math.max(...result.map((item) => item.bbox?.x1 ?? 0)),
					y1: Math.max(...result.map((item) => item.bbox?.y1 ?? 0)),
				},
			},
		];
	});
}

function isLikelyIllustrationFragment(line: OcrLineCandidate) {
	const text = normalizeOcrLine(line.text);
	const stats = line.regionStats;
	const short =
		contentCharacterCount(text) <= 18 || (line.words?.length ?? 0) <= 3;
	return Boolean(
		short &&
			stats &&
			(stats.saturatedFraction > 0.14 ||
				(stats.edgeFraction > 0.22 && stats.darkFraction > 0.16)),
	);
}

function isUncertainOcrLine(line: OcrLineCandidate, language: string) {
	const text = normalizeOcrLine(line.text);
	const content = contentCharacterCount(text);
	const visible = Math.max(1, nonWhitespaceCharacterCount(text));
	const symbolRatio = 1 - content / visible;
	if ([7, 9, 10, 11, 12, 13, 14].includes(line.blockType ?? -1)) return true;
	if (isLikelyIllustrationFragment(line)) return true;
	if (
		/^(?:Content\s*:.*Ministry|Developed\s+by\s*:|Copyright\b|©)/iu.test(text)
	)
		return true;
	if (line.confidence < 38 && (content < 10 || symbolRatio > 0.28)) return true;
	if (
		language === "sin" &&
		line.confidence < 45 &&
		/^[A-Za-z\d\W_]+$/u.test(text)
	)
		return true;
	return false;
}

/** Removes only low-confidence words written wholly in the non-dominant script. */
export function removeWeakMinorityScriptWords(
	line: OcrLineCandidate,
	dominantLanguage: string,
): OcrLineCandidate {
	if (!line.words || !["eng", "sin"].includes(dominantLanguage)) return line;
	let text = line.text;
	for (const word of line.words) {
		const minority =
			dominantLanguage === "eng"
				? /^[\u0D80-\u0DFF\p{M}\p{P}\p{S}]+$/u.test(word.text) &&
					/[\u0D80-\u0DFF]/u.test(word.text)
				: /^[A-Za-z\p{P}\p{S}]+$/u.test(word.text) &&
					/[A-Za-z]/u.test(word.text);
		if (minority && word.confidence < 76) text = text.replace(word.text, " ");
	}
	return { ...line, text: normalizeOcrLine(text) };
}

/**
 * Removes a line only when its shape is strongly consistent with OCR/layout
 * debris. Low confidence alone is never enough to discard teacher content.
 */
export function isLikelyOcrNoiseLine(
	value: string,
	confidence = 100,
	language = "eng+sin",
	options: OcrFilterOptions = {},
) {
	const text = normalizeOcrLine(value);
	if (!text) return true;

	const contentCount = contentCharacterCount(text);
	const visibleCount = nonWhitespaceCharacterCount(text);
	if (contentCount === 0) return true;

	const symbolRatio = visibleCount > 0 ? 1 - contentCount / visibleCount : 1;
	if (confidence < 25 && contentCount <= 2 && symbolRatio >= 0.4) return true;
	if (confidence < 35 && visibleCount <= 2 && contentCount <= 1) return true;
	if (
		!options.preserveStandaloneNumbers &&
		confidence < 70 &&
		/^\d{1,2}$/u.test(text)
	) {
		return true;
	}

	// Sinhala pages often produce isolated Latin table-border hallucinations.
	// Preserve genuine English/ICT terms; reject only very short, weak fragments.
	if (language === "sin" && confidence < 25 && /^[A-Za-z]{1,2}$/u.test(text)) {
		return true;
	}

	return false;
}

/**
 * Builds editable text from Tesseract line output while retaining paragraph
 * boundaries. Confidence metadata is consumed here and never stored per lesson.
 */
export function filterReliableOcrText(
	paragraphs: readonly (readonly OcrLineCandidate[])[],
	language: string,
	options: OcrFilterOptions = {},
): FilteredOcrText {
	let totalLineCount = 0;
	let removedLineCount = 0;
	let uncertainLineCount = 0;
	const keptParagraphs: string[] = [];
	const uncertainParagraphs: string[] = [];
	const pageText = paragraphs
		.flat()
		.map((line) => line.text)
		.join(" ");
	const latinCount = pageText.match(/[A-Za-z]/gu)?.length ?? 0;
	const sinhalaCount = pageText.match(/[\u0D80-\u0DFF]/gu)?.length ?? 0;
	const scriptCount = latinCount + sinhalaCount;
	const latinDominant = scriptCount >= 20 && latinCount / scriptCount >= 0.85;

	for (const paragraph of paragraphs) {
		const keptLines: string[] = [];
		const uncertainLines: string[] = [];
		for (const line of paragraph) {
			totalLineCount += 1;
			const normalized = normalizeOcrLine(line.text);
			const lineLatinCount = normalized.match(/[A-Za-z]/gu)?.length ?? 0;
			const lineSinhalaCount =
				normalized.match(/[\u0D80-\u0DFF]/gu)?.length ?? 0;
			const isWeakMinorityScriptFragment =
				latinDominant &&
				line.confidence < 70 &&
				lineLatinCount === 0 &&
				lineSinhalaCount >= 2;
			const isBottomPageNumber = Boolean(
				!options.preserveStandaloneNumbers &&
					options.pageHeight &&
					line.bbox &&
					line.bbox.y0 > options.pageHeight * 0.94 &&
					/^\d{1,3}$/u.test(normalized),
			);
			if (
				isWeakMinorityScriptFragment ||
				isBottomPageNumber ||
				isLikelyOcrNoiseLine(normalized, line.confidence, language, options)
			) {
				removedLineCount += 1;
				continue;
			}
			if (isUncertainOcrLine(line, language)) {
				uncertainLineCount += 1;
				uncertainLines.push(normalized);
				continue;
			}
			keptLines.push(normalized);
		}
		if (keptLines.length > 0) keptParagraphs.push(keptLines.join("\n"));
		if (uncertainLines.length > 0)
			uncertainParagraphs.push(uncertainLines.join("\n"));
	}

	return {
		text: keptParagraphs.join("\n\n"),
		uncertainText: uncertainParagraphs.join("\n\n"),
		removedLineCount,
		uncertainLineCount,
		totalLineCount,
	};
}

/** Normalizes OCR text conservatively, preserving maths and mixed-language terms. */
export function cleanOcrText(text: string, language = "eng+sin") {
	const lines = text.replace(/\r\n?/gu, "\n").split("\n");
	const cleanedLines: string[] = [];
	let previousWasBlank = true;

	for (const rawLine of lines) {
		const line = normalizeOcrLine(rawLine);
		if (!line || isLikelyOcrNoiseLine(line, 100, language)) {
			if (!previousWasBlank && cleanedLines.length > 0) {
				cleanedLines.push("");
				previousWasBlank = true;
			}
			continue;
		}

		cleanedLines.push(line);
		previousWasBlank = false;
	}

	while (cleanedLines.at(-1) === "") cleanedLines.pop();
	return cleanedLines.join("\n").trim();
}

function paragraphNode(text: string): JSONContent {
	return {
		type: "paragraph",
		content: [{ type: "text", text }],
	};
}

function listItemNode(text: string): JSONContent {
	return {
		type: "listItem",
		content: [paragraphNode(text)],
	};
}

function romanToNumber(value: string) {
	const values: Record<string, number> = {
		I: 1,
		V: 5,
		X: 10,
		L: 50,
		C: 100,
		D: 500,
		M: 1000,
	};
	let result = 0;
	let previous = 0;
	for (const character of value.toUpperCase().split("").reverse()) {
		const current = values[character] ?? 0;
		result += current < previous ? -current : current;
		previous = Math.max(previous, current);
	}
	return result;
}

interface OrderedListItem {
	text: string;
	order: number;
	type?: "I" | "i" | "A" | "a";
}

function parseOrderedListItem(line: string): OrderedListItem | null {
	const match = line.match(ORDERED_MARKER);
	if (!match) return null;

	const marker = match[1];
	const text = match[2].trim();
	if (!text || !CONTENT_CHARACTER.test(text)) return null;

	if (/^\d+$/u.test(marker)) {
		return { text, order: Number(marker) };
	}
	if (/^[IVXLCDM]+$/u.test(marker)) {
		return { text, order: romanToNumber(marker), type: "I" };
	}
	if (/^[ivxlcdm]+$/u.test(marker)) {
		return { text, order: romanToNumber(marker), type: "i" };
	}

	const isUppercase = marker === marker.toUpperCase();
	return {
		text,
		order: marker.toUpperCase().charCodeAt(0) - 64,
		type: isUppercase ? "A" : "a",
	};
}

function splitTableColumns(line: string) {
	const columns = line
		.split(/\s{3,}/u)
		.map((column) => column.trim())
		.filter(Boolean);
	if (columns.length < 2 || columns.length > 4) return null;
	if (columns.some((column) => !CONTENT_CHARACTER.test(column))) return null;
	if (columns.some((column) => column.length > 80)) return null;
	return columns;
}

interface DetectedTableRow {
	cells: OcrWordCandidate[];
	confidence: number;
}

function detectedTableRow(line: OcrLineCandidate): DetectedTableRow | null {
	const spatialCells = line.layoutFragments
		?.map((fragment) => ({
			...fragment,
			text: normalizeOcrLine(fragment.text),
		}))
		.filter(
			(fragment) => fragment.text && CONTENT_CHARACTER.test(fragment.text),
		);

	if (spatialCells && spatialCells.length >= 2 && spatialCells.length <= 4) {
		if (spatialCells.some((cell) => cell.text.length > 80)) return null;
		return {
			cells: spatialCells,
			confidence:
				spatialCells.reduce((sum, cell) => sum + cell.confidence, 0) /
				spatialCells.length,
		};
	}

	const columns = splitTableColumns(normalizeOcrLine(line.text));
	if (!columns) return null;
	return {
		cells: columns.map((text) => ({ text, confidence: line.confidence })),
		confidence: line.confidence,
	};
}

function tableCandidateId(rows: readonly (readonly string[])[], start: number) {
	let hash = 2166136261;
	for (const character of rows.flat().join("\u001f")) {
		hash ^= character.codePointAt(0) ?? 0;
		hash = Math.imul(hash, 16777619);
	}
	return `table-${start}-${(hash >>> 0).toString(36)}`;
}

function hasStableSpatialColumns(
	rows: readonly DetectedTableRow[],
	pageWidth: number,
) {
	if (
		pageWidth <= 0 ||
		rows.some((row) => row.cells.some((cell) => !cell.bbox))
	) {
		return false;
	}

	const columnCount = rows[0]?.cells.length ?? 0;
	for (let column = 0; column < columnCount; column += 1) {
		const centers = rows.map((row) => {
			const bbox = row.cells[column].bbox as OcrBoundingBox;
			return (bbox.x0 + bbox.x1) / 2;
		});
		const sorted = [...centers].sort((left, right) => left - right);
		const median = sorted[Math.floor(sorted.length / 2)];
		if (
			centers.some((center) => Math.abs(center - median) > pageWidth * 0.03)
		) {
			return false;
		}
	}
	return true;
}

function buildTableCandidate(
	rows: readonly DetectedTableRow[],
	start: number,
	pageWidth: number,
): OcrTableCandidate {
	const textRows = rows.map((row) => row.cells.map((cell) => cell.text));
	const confidence = Math.round(
		rows.reduce((sum, row) => sum + row.confidence, 0) / rows.length,
	);
	const minimumConfidence = Math.min(...rows.map((row) => row.confidence));
	const visibleCharacters = textRows.flat().join("").replace(/\s/gu, "");
	const contentRatio =
		visibleCharacters.length > 0
			? contentCharacterCount(visibleCharacters) /
				Array.from(visibleCharacters).length
			: 0;
	const spatiallyAligned = hasStableSpatialColumns(rows, pageWidth);
	const layoutScore = Math.min(
		100,
		Math.round(
			Math.min(30, rows.length * 8) +
				Math.min(30, confidence * 0.3) +
				contentRatio * 20 +
				(spatiallyAligned ? 20 : 0),
		),
	);

	return {
		id: tableCandidateId(textRows, start),
		rows: textRows,
		sourceText: textRows.map((row) => row.join("   ")).join("\n"),
		confidence,
		layoutScore,
		hasSpatialEvidence: spatiallyAligned,
		autoConvert:
			rows.length >= 3 &&
			confidence >= 65 &&
			minimumConfidence >= 45 &&
			contentRatio >= 0.72 &&
			spatiallyAligned,
	};
}

/**
 * Detects consecutive, consistently aligned 2-4 column rows. Candidate metadata
 * is transient and deliberately separate from the compact lesson JSON.
 */
export function detectOcrTableCandidates(
	paragraphs: readonly (readonly OcrLineCandidate[])[],
	pageWidth = 0,
): OcrTableCandidate[] {
	const lines = paragraphs.flat();
	const candidates: OcrTableCandidate[] = [];

	for (let index = 0; index < lines.length; ) {
		const first = detectedTableRow(lines[index]);
		if (!first) {
			index += 1;
			continue;
		}

		const rows = [first];
		let cursor = index + 1;
		while (cursor < lines.length) {
			const next = detectedTableRow(lines[cursor]);
			if (!next || next.cells.length !== first.cells.length) break;
			rows.push(next);
			cursor += 1;
		}

		if (rows.length >= 2) {
			candidates.push(buildTableCandidate(rows, index, pageWidth));
			index = cursor;
			continue;
		}
		index += 1;
	}

	return candidates;
}

/** Text-only fallback used after a teacher edits the reviewed OCR draft. */
export function detectTextTableCandidates(text: string): OcrTableCandidate[] {
	const lines = cleanOcrText(text)
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean)
		.map<OcrLineCandidate>((line) => ({ text: line, confidence: 100 }));
	return detectOcrTableCandidates(lines.map((line) => [line]));
}

function tableNode(
	rows: readonly (readonly string[])[],
	withHeaderRow = false,
): JSONContent {
	return {
		type: "table",
		content: rows.map((row, rowIndex) => ({
			type: "tableRow",
			content: row.map((cell) => ({
				type: withHeaderRow && rowIndex === 0 ? "tableHeader" : "tableCell",
				content: [paragraphNode(cell)],
			})),
		})),
	};
}

function orderedListNode(items: readonly OrderedListItem[]): JSONContent {
	const first = items[0];
	const attrs: Record<string, number | string> = {};
	if (first.order !== 1) attrs.start = first.order;
	if (first.type) attrs.type = first.type;

	return {
		type: "orderedList",
		...(Object.keys(attrs).length > 0 ? { attrs } : {}),
		content: items.map((item) => listItemNode(item.text)),
	};
}

/**
 * Converts reviewed OCR text to native Tiptap nodes. It stores only semantic
 * content: no boxes, confidence arrays, candidate scores, or raw OCR payload.
 */
export function ocrTextToTiptapBlocks(
	text: string,
	language = "eng+sin",
	options: OcrTextToTiptapOptions = {},
): JSONContent[] {
	const cleaned = cleanOcrText(text, language);
	if (!cleaned) return [];

	const lines = cleaned.split("\n");
	const nodes: JSONContent[] = [];

	for (let index = 0; index < lines.length; ) {
		const line = lines[index].trim();
		if (!line) {
			index += 1;
			continue;
		}

		const firstColumns = splitTableColumns(line);
		if (firstColumns) {
			const rows = [firstColumns];
			let cursor = index + 1;
			while (cursor < lines.length) {
				const candidateIndex =
					!lines[cursor].trim() && lines[cursor + 1]?.trim()
						? cursor + 1
						: cursor;
				const columns = splitTableColumns(lines[candidateIndex]);
				if (!columns || columns.length !== firstColumns.length) break;
				rows.push(columns);
				cursor = candidateIndex + 1;
			}
			if (rows.length >= 2) {
				const matchingCandidate = options.tableCandidates?.find(
					(candidate) =>
						JSON.stringify(candidate.rows) === JSON.stringify(rows),
				);
				const selection = options.tableSelections?.find(
					(item) => item.candidateId === matchingCandidate?.id,
				);
				if (selection) {
					nodes.push(tableNode(rows, selection.withHeaderRow));
				} else {
					nodes.push(...rows.map((row) => paragraphNode(row.join(" — "))));
				}
				index = cursor;
				continue;
			}
		}

		const ordered = parseOrderedListItem(line);
		if (ordered) {
			const items = [ordered];
			let cursor = index + 1;
			while (cursor < lines.length) {
				const candidateIndex =
					!lines[cursor].trim() && lines[cursor + 1]?.trim()
						? cursor + 1
						: cursor;
				const next = parseOrderedListItem(lines[candidateIndex].trim());
				const previous = items.at(-1);
				if (
					!next ||
					!previous ||
					next.type !== ordered.type ||
					next.order !== previous.order + 1
				) {
					break;
				}
				items.push(next);
				cursor = candidateIndex + 1;
			}
			nodes.push(orderedListNode(items));
			index = cursor;
			continue;
		}

		if (BULLET_MARKER.test(line)) {
			const items: string[] = [];
			let cursor = index;
			while (cursor < lines.length) {
				const candidateIndex =
					!lines[cursor].trim() && lines[cursor + 1]?.trim()
						? cursor + 1
						: cursor;
				const candidate = lines[candidateIndex].trim();
				if (!BULLET_MARKER.test(candidate)) break;
				const item = candidate.replace(BULLET_MARKER, "").trim();
				if (item && CONTENT_CHARACTER.test(item)) items.push(item);
				cursor = candidateIndex + 1;
			}
			if (items.length > 0) {
				nodes.push({
					type: "bulletList",
					content: items.map(listItemNode),
				});
			}
			index = cursor;
			continue;
		}

		nodes.push(paragraphNode(line.replace(/\s{3,}/gu, " ")));
		index += 1;
	}

	return nodes;
}

export function normalizeOcrTextForComparison(text: string) {
	return cleanOcrText(text)
		.replace(ORDERED_PREFIXES, "")
		.replace(BULLET_PREFIXES, "")
		.toLocaleLowerCase()
		.replace(/[\p{P}\p{S}\s]+/gu, "");
}
