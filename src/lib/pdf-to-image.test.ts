// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

const destroyMock = vi.fn();
const renderMock = vi.fn(() => ({ promise: Promise.resolve() }));
const getPageMock = vi.fn(() =>
	Promise.resolve({
		getViewport: vi.fn(() => ({ width: 120, height: 80 })),
		render: renderMock,
	}),
);
const getDocumentMock = vi.fn(() => ({
	promise: Promise.resolve({
		getPage: getPageMock,
	}),
	destroy: destroyMock,
}));

vi.mock("pdfjs-dist", () => ({
	GlobalWorkerOptions: {},
	getDocument: getDocumentMock,
}));

vi.mock("pdfjs-dist/build/pdf.worker.mjs?url", () => ({
	default: "/mock-pdf-worker.mjs",
}));

describe("convertFirstPdfPageToImageFile", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		HTMLCanvasElement.prototype.getContext = vi.fn(() => ({})) as never;
		HTMLCanvasElement.prototype.toBlob = vi.fn((callback) => {
			callback(new Blob(["png"], { type: "image/png" }));
		}) as never;
	});

	it("rejects non-PDF files", async () => {
		const { convertFirstPdfPageToImageFile } = await import("./pdf-to-image");

		await expect(
			convertFirstPdfPageToImageFile(
				new File(["image"], "note.png", { type: "image/png" }),
			),
		).rejects.toThrow("Only PDF files");
		expect(getDocumentMock).not.toHaveBeenCalled();
	});

	it("renders the first PDF page to a PNG file", async () => {
		const { convertFirstPdfPageToImageFile } = await import("./pdf-to-image");

		const result = await convertFirstPdfPageToImageFile(
			new File(["%PDF"], "teacher-notes.pdf", { type: "application/pdf" }),
		);

		expect(getDocumentMock).toHaveBeenCalledOnce();
		expect(getPageMock).toHaveBeenCalledWith(1);
		expect(renderMock).toHaveBeenCalledOnce();
		expect(destroyMock).toHaveBeenCalledOnce();
		expect(result.name).toBe("teacher-notes-page-1.png");
		expect(result.type).toBe("image/png");
	});

	it("surfaces render failures and still destroys the PDF document", async () => {
		getPageMock.mockRejectedValueOnce(new Error("bad page"));
		const { convertFirstPdfPageToImageFile } = await import("./pdf-to-image");

		await expect(
			convertFirstPdfPageToImageFile(
				new File(["%PDF"], "broken.pdf", { type: "application/pdf" }),
			),
		).rejects.toThrow("bad page");
		expect(destroyMock).toHaveBeenCalledOnce();
	});
});
