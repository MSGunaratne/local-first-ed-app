export interface PdfToImageOptions {
	scale?: number;
	outputName?: string;
}

const PDF_MIME_TYPE = "application/pdf";
const PNG_MIME_TYPE = "image/png";

export function isPdfFile(file: File): boolean {
	return (
		file.type === PDF_MIME_TYPE || file.name.toLowerCase().endsWith(".pdf")
	);
}

function createOutputName(file: File, explicitName?: string): string {
	if (explicitName) return explicitName;
	return `${file.name.replace(/\.pdf$/i, "")}-page-1.png`;
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
	return new Promise((resolve, reject) => {
		canvas.toBlob((blob) => {
			if (!blob) {
				reject(new Error("PDF page could not be converted to an image."));
				return;
			}
			resolve(blob);
		}, PNG_MIME_TYPE);
	});
}

export async function convertFirstPdfPageToImageFile(
	file: File,
	options: PdfToImageOptions = {},
): Promise<File> {
	if (!isPdfFile(file)) {
		throw new Error("Only PDF files can be converted.");
	}
	if (typeof window === "undefined" || typeof document === "undefined") {
		throw new Error("PDF conversion is only available in the browser.");
	}

	// pdfjs evaluates DOMMatrix at module initialization. Keeping both imports
	// behind the browser boundary prevents lesson-form SSR from loading it.
	const [pdfjs, workerModule] = await Promise.all([
		import("pdfjs-dist"),
		import("pdfjs-dist/build/pdf.worker.mjs?url"),
	]);
	pdfjs.GlobalWorkerOptions.workerSrc = workerModule.default;

	const arrayBuffer = await file.arrayBuffer();
	const loadingTask = pdfjs.getDocument({ data: new Uint8Array(arrayBuffer) });
	const pdf = await loadingTask.promise;

	try {
		const page = await pdf.getPage(1);
		const viewport = page.getViewport({ scale: options.scale ?? 2 });
		const canvas = document.createElement("canvas");
		const context = canvas.getContext("2d");

		if (!context) {
			throw new Error("Canvas is not available for PDF rendering.");
		}

		canvas.width = Math.ceil(viewport.width);
		canvas.height = Math.ceil(viewport.height);

		await page.render({
			canvas,
			canvasContext: context,
			viewport,
		}).promise;

		const blob = await canvasToBlob(canvas);
		return new File([blob], createOutputName(file, options.outputName), {
			type: PNG_MIME_TYPE,
		});
	} finally {
		await loadingTask.destroy();
	}
}
