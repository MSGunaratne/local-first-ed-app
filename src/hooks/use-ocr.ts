import { useCallback, useEffect, useRef, useState } from "react";
import type { PSM, Worker } from "tesseract.js";

interface UseOCROptions {
	/** Page segmentation mode - affects how Tesseract interprets the image layout */
	pageSegmentationMode?: PSM;
	/** Preprocess image (convert to grayscale & increase contrast) before scanning */
	preprocess?: boolean;
	/** Contrast adjustment level (-255 to 255, defaults to 80) */
	contrast?: number;
	/** Language for OCR (e.g. 'eng', 'sin', or 'eng+sin') */
	language?: string;
}

interface UseOCRResult {
	text: string;
	confidence: number | null;
	progress: number;
	status: "idle" | "loading" | "success" | "error";
	scanImage: (file: File) => Promise<void>;
	setText: (text: string) => void;
	reset: () => void;
}

const OCR_CANVAS_BORDER = 20;
const MIN_OCR_LONG_EDGE = 1400;
const MAX_OCR_LONG_EDGE = 2800;

/**
 * Preprocesses an image by converting to grayscale and increasing contrast using Canvas.
 * This is critical to boost Tesseract OCR accuracy on shadowy or low-contrast paper documents.
 */
function preprocessImage(file: File, contrast: number = 80): Promise<File> {
	return new Promise((resolve) => {
		const img = new Image();
		const objectUrl = URL.createObjectURL(file);

		img.onload = () => {
			const canvas = document.createElement("canvas");
			const ctx = canvas.getContext("2d");
			if (!ctx) {
				URL.revokeObjectURL(objectUrl);
				resolve(file);
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
				const data = imageData.data;

				// Apply grayscale + contrast filter
				const factor = (259 * (contrast + 255)) / (255 * (259 - contrast));

				for (let i = 0; i < data.length; i += 4) {
					const r = data[i];
					const g = data[i + 1];
					const b = data[i + 2];

					// 1. Grayscale conversion
					const gray = 0.299 * r + 0.587 * g + 0.114 * b;

					// 2. High contrast adjustment
					let cGray = factor * (gray - 128) + 128;
					cGray = Math.max(0, Math.min(255, cGray));

					// Set RGB values
					data[i] = cGray;
					data[i + 1] = cGray;
					data[i + 2] = cGray;
				}

				ctx.putImageData(imageData, 0, 0);

				canvas.toBlob((blob) => {
					URL.revokeObjectURL(objectUrl);
					if (blob) {
						resolve(new File([blob], file.name, { type: "image/png" }));
					} else {
						resolve(file);
					}
				}, "image/png");
			} catch (e) {
				console.warn(
					"Image preprocessing failed, falling back to raw image:",
					e,
				);
				URL.revokeObjectURL(objectUrl);
				resolve(file);
			}
		};

		img.onerror = () => {
			URL.revokeObjectURL(objectUrl);
			resolve(file); // Fallback
		};

		img.src = objectUrl;
	});
}

/**
 * Custom hook for client-side OCR using Tesseract.js
 * Supports English and Sinhala (eng+sin) with offline WASM
 *
 * @example
 * ```tsx
 * const { text, progress, status, scanImage, setText } = useOCR({
 *   pageSegmentationMode: 6 // Good for structured notes
 * });
 * ```
 */
export function useOCR(options?: UseOCROptions): UseOCRResult {
	const [text, setText] = useState("");
	const [confidence, setConfidence] = useState<number | null>(null);
	const [progress, setProgress] = useState(0);
	const [status, setStatus] = useState<
		"idle" | "loading" | "success" | "error"
	>("idle");

	const psm = (options?.pageSegmentationMode ?? 3) as unknown as PSM;
	const preprocess = options?.preprocess ?? true;
	const contrast = options?.contrast ?? 80;
	const language = options?.language ?? "sin";

	/**
	 * Tesseract Configuration Guide for Future Enhancements:
	 *
	 * OCR Engine Mode (OEM):
	 *   0: Legacy Tesseract
	 *   1: LSTM Only (Neural Net) - Best for this setup
	 *   2: Legacy + LSTM
	 *   3: Default
	 *
	 * Page Segmentation Mode (PSM):
	 *   0:  OSD only
	 *   1:  Auto with OSD
	 *   3:  Fully automatic (default)
	 *   4:  Single column
	 *   6:  Single uniform block (good for notes)
	 *   7:  Single line
	 *   11: Sparse text (good for diagrams/mind maps)
	 *   13: Raw line
	 */

	// Reuse worker instance to avoid repeated initialization
	const workerRef = useRef<Worker | null>(null);
	const workerLangRef = useRef<string | null>(null);

	useEffect(() => {
		// Cleanup worker on unmount
		return () => {
			if (workerRef.current) {
				workerRef.current.terminate();
				workerRef.current = null;
			}
		};
	}, []);

	const scanImage = useCallback(
		async (file: File) => {
			if (typeof window === "undefined") {
				return;
			}

			setStatus("loading");
			setProgress(0);
			setText("");
			setConfidence(null);

			try {
				let fileToScan = file;
				if (preprocess) {
					setProgress(2); // Initial progress showing preprocessing started
					fileToScan = await preprocessImage(file, contrast);
				}

				const { createWorker } = await import("tesseract.js");

				// If language has changed, terminate the old worker
				if (workerRef.current && workerLangRef.current !== language) {
					await workerRef.current.terminate();
					workerRef.current = null;
				}

				if (!workerRef.current) {
					// Create worker with offline config (WASM from public/ocr-data)
					workerRef.current = await createWorker(language, 1, {
						workerPath: "/ocr-data/worker.min.js",
						corePath: "/ocr-data/tesseract-core.wasm.js",
						langPath: "/ocr-data",
						logger: (m) => {
							if (m.status === "recognizing text") {
								// Tesseract progress starts at 0, map to 5% - 100% range
								const p = Math.round(m.progress * 95) + 5;
								setProgress(p);
							}
						},
					});
					workerLangRef.current = language;
				}

				const worker = workerRef.current;

				// Apply page segmentation mode before recognition
				await worker.setParameters({
					tessedit_pageseg_mode: psm,
					preserve_interword_spaces: "1",
					user_defined_dpi: "300",
				});

				const {
					data: { text: extractedText, confidence: meanConfidence },
				} = await worker.recognize(fileToScan);

				setText(extractedText);
				setConfidence(meanConfidence);
				setStatus("success");
				setProgress(100);
			} catch (error) {
				console.error("OCR Error:", error);
				setStatus("error");
			}
		},
		[psm, preprocess, contrast, language],
	);

	const reset = useCallback(() => {
		setText("");
		setConfidence(null);
		setProgress(0);
		setStatus("idle");
	}, []);

	return {
		text,
		confidence,
		progress,
		status,
		scanImage,
		setText,
		reset,
	};
}
