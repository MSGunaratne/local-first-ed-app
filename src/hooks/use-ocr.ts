import { useCallback, useEffect, useRef, useState } from "react";
import type { Block, PSM, Worker } from "tesseract.js";
import {
	buildOcrImageRegionMap,
	getOcrRegionStats,
	normalizeOcrImagePixels,
	type OcrImageRegionMap,
} from "@/lib/ocr-image-normalization";
import {
	detectOcrTableCandidates,
	filterReliableOcrText,
	mergeOcrLineCandidates,
	mergeSpatialLineFragments,
	type OcrLineCandidate,
	type OcrTableCandidate,
	removeWeakMinorityScriptWords,
	repairSubjectOcrLine,
} from "@/lib/ocr-postprocess";

interface UseOCROptions {
	pageSegmentationMode?: PSM;
	preprocess?: boolean;
	contrast?: number;
	language?: string;
	preserveStandaloneNumbers?: boolean;
	subject?: "math" | "english" | "ict" | string;
}

interface UseOCRResult {
	text: string;
	tableCandidates: OcrTableCandidate[];
	confidence: number | null;
	filteredLineCount: number;
	uncertainText: string;
	uncertainLineCount: number;
	progress: number;
	status: "idle" | "loading" | "success" | "error";
	scanImage: (file: File) => Promise<void>;
	setText: (text: string) => void;
	reset: () => void;
}

const OCR_CANVAS_BORDER = 20;
const MIN_OCR_LONG_EDGE = 1400;
const MAX_OCR_LONG_EDGE = 2800;

function linesFromBlocks(
	blocks: Block[] | null,
	regionMap: OcrImageRegionMap | null,
	source: OcrLineCandidate["source"],
) {
	if (!blocks) return [];
	return blocks.flatMap((block) =>
		block.paragraphs.flatMap((paragraph) =>
			paragraph.lines.map<OcrLineCandidate>((line) => ({
				text: line.text,
				confidence: line.confidence,
				bbox: line.bbox,
				words: line.words.map((word) => ({
					text: word.text,
					confidence: word.confidence,
					bbox: word.bbox,
				})),
				blockType: Number(block.blocktype),
				regionStats: getOcrRegionStats(regionMap, line.bbox),
				source,
			})),
		),
	);
}

interface PreparedOcrImage {
	file: File;
	regionMap: OcrImageRegionMap | null;
}

function preprocessImage(file: File, contrast = 80): Promise<PreparedOcrImage> {
	return new Promise((resolve) => {
		const img = new Image();
		const objectUrl = URL.createObjectURL(file);
		img.onload = () => {
			const canvas = document.createElement("canvas");
			const ctx = canvas.getContext("2d");
			if (!ctx) {
				URL.revokeObjectURL(objectUrl);
				resolve({ file, regionMap: null });
				return;
			}
			const longEdge = Math.max(img.width, img.height);
			const scale =
				longEdge < MIN_OCR_LONG_EDGE
					? MIN_OCR_LONG_EDGE / longEdge
					: longEdge > MAX_OCR_LONG_EDGE
						? MAX_OCR_LONG_EDGE / longEdge
						: 1;
			const targetWidth = Math.round(img.width * scale);
			const targetHeight = Math.round(img.height * scale);
			canvas.width = targetWidth + OCR_CANVAS_BORDER * 2;
			canvas.height = targetHeight + OCR_CANVAS_BORDER * 2;
			ctx.fillStyle = "#fff";
			ctx.fillRect(0, 0, canvas.width, canvas.height);
			ctx.imageSmoothingEnabled = true;
			ctx.imageSmoothingQuality = "high";
			ctx.drawImage(
				img,
				OCR_CANVAS_BORDER,
				OCR_CANVAS_BORDER,
				targetWidth,
				targetHeight,
			);

			try {
				const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
				const regionMap = buildOcrImageRegionMap(
					imageData.data,
					canvas.width,
					canvas.height,
				);
				normalizeOcrImagePixels(imageData.data, contrast);
				ctx.putImageData(imageData, 0, 0);
				canvas.toBlob((blob) => {
					URL.revokeObjectURL(objectUrl);
					resolve({
						file: blob
							? new File([blob], file.name, { type: "image/png" })
							: file,
						regionMap: blob ? regionMap : null,
					});
				}, "image/png");
			} catch (error) {
				console.warn(
					"Image preprocessing failed, falling back to raw image:",
					error,
				);
				URL.revokeObjectURL(objectUrl);
				resolve({ file, regionMap: null });
			}
		};
		img.onerror = () => {
			URL.revokeObjectURL(objectUrl);
			resolve({ file, regionMap: null });
		};
		img.src = objectUrl;
	});
}

function dominantScriptLanguage(text: string, fallback: string) {
	const latin = text.match(/[A-Za-z]/gu)?.length ?? 0;
	const sinhala = text.match(/[\u0D80-\u0DFF]/gu)?.length ?? 0;
	const total = latin + sinhala;
	if (total >= 20 && latin / total >= 0.85) return "eng";
	if (total >= 20 && sinhala / total >= 0.85) return "sin";
	return fallback;
}

export function useOCR(options?: UseOCROptions): UseOCRResult {
	const [text, setText] = useState("");
	const [tableCandidates, setTableCandidates] = useState<OcrTableCandidate[]>(
		[],
	);
	const [confidence, setConfidence] = useState<number | null>(null);
	const [filteredLineCount, setFilteredLineCount] = useState(0);
	const [uncertainText, setUncertainText] = useState("");
	const [uncertainLineCount, setUncertainLineCount] = useState(0);
	const [progress, setProgress] = useState(0);
	const [status, setStatus] = useState<
		"idle" | "loading" | "success" | "error"
	>("idle");
	const psm = (options?.pageSegmentationMode ?? 3) as unknown as PSM;
	const preprocess = options?.preprocess ?? true;
	const contrast = options?.contrast ?? 80;
	const language = options?.language ?? "sin";
	const preserveStandaloneNumbers = options?.preserveStandaloneNumbers ?? false;
	const subject = options?.subject;
	const workerRef = useRef<Worker | null>(null);
	const workerLangRef = useRef<string | null>(null);

	useEffect(
		() => () => {
			void workerRef.current?.terminate();
			workerRef.current = null;
		},
		[],
	);

	const scanImage = useCallback(
		async (file: File) => {
			if (typeof window === "undefined") return;
			setStatus("loading");
			setProgress(0);
			setText("");
			setTableCandidates([]);
			setConfidence(null);
			setFilteredLineCount(0);
			setUncertainText("");
			setUncertainLineCount(0);

			try {
				let fileToScan = file;
				let regionMap: OcrImageRegionMap | null = null;
				if (preprocess) {
					setProgress(2);
					const prepared = await preprocessImage(file, contrast);
					fileToScan = prepared.file;
					regionMap = prepared.regionMap;
				}

				const { createWorker } = await import("tesseract.js");
				if (workerRef.current && workerLangRef.current !== language) {
					await workerRef.current.terminate();
					workerRef.current = null;
				}
				if (!workerRef.current) {
					workerRef.current = await createWorker(language, 1, {
						workerPath: "/ocr-data/worker.min.js",
						corePath: "/ocr-data/tesseract-core.wasm.js",
						langPath: "/ocr-data",
						logger: (message) => {
							if (message.status === "recognizing text") {
								setProgress(
									Math.min(96, Math.round(message.progress * 70) + 5),
								);
							}
						},
					});
					workerLangRef.current = language;
				}
				const worker = workerRef.current;
				await worker.setParameters({
					tessedit_pageseg_mode: psm,
					preserve_interword_spaces: "1",
					user_defined_dpi: "300",
					tessedit_char_whitelist: "",
				});
				const first = await worker.recognize(
					fileToScan,
					{ rotateAuto: true },
					{ text: true, blocks: true },
				);
				const dominantLanguage = dominantScriptLanguage(
					first.data.text,
					language,
				);
				const autoLines = linesFromBlocks(
					first.data.blocks,
					regionMap,
					"auto",
				).map((line) =>
					repairSubjectOcrLine(
						removeWeakMinorityScriptWords(line, dominantLanguage),
						subject,
					),
				);
				let refinementLines: OcrLineCandidate[] = [];

				// Sparse text recovers omitted questions/table cells; single-language
				// refinement prevents the unused script model from inventing characters.
				if (first.data.confidence >= 58) {
					setProgress(76);
					if (dominantLanguage !== workerLangRef.current) {
						await worker.reinitialize(dominantLanguage, 1);
						workerLangRef.current = dominantLanguage;
					}
					await worker.setParameters({
						tessedit_pageseg_mode: 11 as unknown as PSM,
						preserve_interword_spaces: "1",
						user_defined_dpi: "300",
						tessedit_char_whitelist: "",
					});
					const refinement = await worker.recognize(
						fileToScan,
						{},
						{ text: true, blocks: true },
					);
					refinementLines = linesFromBlocks(
						refinement.data.blocks,
						regionMap,
						dominantLanguage === language ? "sparse" : "language",
					).map((line) =>
						repairSubjectOcrLine(
							removeWeakMinorityScriptWords(line, dominantLanguage),
							subject,
						),
					);
				}

				let mergedLines = mergeOcrLineCandidates([autoLines, refinementLines]);
				if (subject === "math" || preserveStandaloneNumbers) {
					const candidates = mergedLines
						.filter(
							(line) =>
								line.bbox &&
								line.confidence < 70 &&
								/[\d=+\-xXaAcCpP]/u.test(line.text),
						)
						.slice(0, 6);
					if (candidates.length > 0) {
						if (workerLangRef.current !== "eng") {
							await worker.reinitialize("eng", 1);
							workerLangRef.current = "eng";
						}
						await worker.setParameters({
							tessedit_pageseg_mode: 7 as unknown as PSM,
							tessedit_char_whitelist:
								"0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz=+-xX().°",
						});
						const retries: OcrLineCandidate[] = [];
						for (const candidate of candidates) {
							const bbox = candidate.bbox;
							if (!bbox) continue;
							const retry = await worker.recognize(
								fileToScan,
								{
									rectangle: {
										left: bbox.x0,
										top: bbox.y0,
										width: bbox.x1 - bbox.x0,
										height: bbox.y1 - bbox.y0,
									},
								},
								{ text: true },
							);
							const retryText = retry.data.text.trim();
							const oldTokens =
								candidate.text.match(/[\d=+\-xX]/gu)?.length ?? 0;
							const newTokens = retryText.match(/[\d=+\-xX]/gu)?.length ?? 0;
							if (
								retryText &&
								retry.data.confidence >= candidate.confidence + 8 &&
								newTokens >= oldTokens
							) {
								retries.push({
									...candidate,
									text: retryText,
									confidence: retry.data.confidence,
									source: "single-line",
								});
							}
						}
						mergedLines = mergeOcrLineCandidates([mergedLines, retries]);
					}
				}

				const rows = mergeSpatialLineFragments(mergedLines, regionMap?.width);
				const filtered = filterReliableOcrText(rows, dominantLanguage, {
					preserveStandaloneNumbers,
					pageWidth: regionMap?.width,
					pageHeight: regionMap?.height,
				});
				const keptLines = new Set(
					filtered.text
						.split("\n")
						.map((line) => line.trim())
						.filter(Boolean),
				);
				setTableCandidates(
					detectOcrTableCandidates(rows, regionMap?.width).filter((candidate) =>
						candidate.sourceText
							.split("\n")
							.every((line) => keptLines.has(line)),
					),
				);
				setText(filtered.text || first.data.text);
				setConfidence(first.data.confidence);
				setFilteredLineCount(filtered.removedLineCount);
				setUncertainText(filtered.uncertainText);
				setUncertainLineCount(filtered.uncertainLineCount);
				setStatus("success");
				setProgress(100);
			} catch (error) {
				console.error("OCR Error:", error);
				setStatus("error");
			}
		},
		[psm, preprocess, contrast, language, preserveStandaloneNumbers, subject],
	);

	const reset = useCallback(() => {
		setText("");
		setTableCandidates([]);
		setConfidence(null);
		setFilteredLineCount(0);
		setUncertainText("");
		setUncertainLineCount(0);
		setProgress(0);
		setStatus("idle");
	}, []);

	return {
		text,
		tableCandidates,
		confidence,
		filteredLineCount,
		uncertainText,
		uncertainLineCount,
		progress,
		status,
		scanImage,
		setText,
		reset,
	};
}
