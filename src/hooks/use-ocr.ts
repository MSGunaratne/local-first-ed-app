import { useCallback, useEffect, useRef, useState } from "react";
import { createWorker, PSM, type Worker } from "tesseract.js";

interface UseOCROptions {
	/** Page segmentation mode - affects how Tesseract interprets the image layout */
	pageSegmentationMode?: PSM;
}

interface UseOCRResult {
	text: string;
	progress: number;
	status: "idle" | "loading" | "success" | "error";
	scanImage: (file: File) => Promise<void>;
	setText: (text: string) => void;
	reset: () => void;
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
	const [progress, setProgress] = useState(0);
	const [status, setStatus] = useState<
		"idle" | "loading" | "success" | "error"
	>("idle");

	const psm = options?.pageSegmentationMode ?? PSM.AUTO;

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
			setStatus("loading");
			setProgress(0);
			setText("");

			try {
				if (!workerRef.current) {
					// Create worker with offline config (WASM from public/ocr-data)
					workerRef.current = await createWorker("eng+sin", 1, {
						workerPath: "/ocr-data/worker.min.js",
						corePath: "/ocr-data/tesseract-core.wasm.js",
						langPath: "/ocr-data/",
						logger: (m) => {
							if (m.status === "recognizing text") {
								setProgress(Math.round(m.progress * 100));
							}
						},
					});
				}

				const worker = workerRef.current;

				// Apply page segmentation mode before recognition
				await worker.setParameters({
					tessedit_pageseg_mode: psm,
				});

				const {
					data: { text: extractedText },
				} = await worker.recognize(file);

				setText(extractedText);
				setStatus("success");
				setProgress(100);
			} catch (error) {
				console.error("OCR Error:", error);
				setStatus("error");
			}
		},
		[psm],
	);

	const reset = useCallback(() => {
		setText("");
		setProgress(0);
		setStatus("idle");
	}, []);

	return {
		text,
		progress,
		status,
		scanImage,
		setText,
		reset,
	};
}
