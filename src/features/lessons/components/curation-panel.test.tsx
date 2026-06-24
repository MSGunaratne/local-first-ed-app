// @vitest-environment jsdom

import { fireEvent, render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Subject } from "@/types/lesson";
import { CurationPanel } from "./curation-panel";

const { scanImageMock, convertPdfMock } = vi.hoisted(() => ({
	scanImageMock: vi.fn(),
	convertPdfMock: vi.fn(),
}));

vi.mock("sonner", () => ({
	toast: {
		error: vi.fn(),
		info: vi.fn(),
		success: vi.fn(),
		warning: vi.fn(),
	},
}));

vi.mock("@/paraglide/messages", () => ({
	m: new Proxy(
		{},
		{
			get: (_target, property) => (params?: Record<string, string>) =>
				params
					? `${String(property)} ${JSON.stringify(params)}`
					: String(property),
		},
	),
}));

vi.mock("@/hooks/use-ocr", () => ({
	useOCR: () => ({
		text: "",
		confidence: null,
		progress: 0,
		status: "idle",
		scanImage: scanImageMock,
		reset: vi.fn(),
	}),
}));

vi.mock("@/lib/content-mapper", () => ({
	findMatches: vi.fn(() => Promise.resolve([])),
}));

vi.mock("@/lib/pdf-to-image", () => {
	return {
		isPdfFile: (file: File) =>
			file.type === "application/pdf" || file.name.endsWith(".pdf"),
		convertFirstPdfPageToImageFile: convertPdfMock,
	};
});

describe("CurationPanel upload handling", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		URL.createObjectURL = vi.fn(() => "blob:preview");
		URL.revokeObjectURL = vi.fn();
		convertPdfMock.mockResolvedValue(
			new File(["png"], "notes-page-1.png", { type: "image/png" }),
		);
	});

	it("scans uploaded images directly", async () => {
		const { container } = render(<CurationPanel subject={Subject.ENGLISH} />);
		const input = container.querySelector("input[type='file']");
		expect(input).not.toBeNull();

		const file = new File(["image"], "notes.png", { type: "image/png" });
		fireEvent.change(input as HTMLInputElement, {
			target: { files: [file] },
		});

		await waitFor(() => expect(scanImageMock).toHaveBeenCalledWith(file));
		expect(convertPdfMock).not.toHaveBeenCalled();
	});

	it("converts the first page of uploaded PDFs before scanning", async () => {
		const converted = new File(["png"], "notes-page-1.png", {
			type: "image/png",
		});
		convertPdfMock.mockResolvedValueOnce(converted);

		const { container } = render(<CurationPanel subject={Subject.ENGLISH} />);
		const input = container.querySelector("input[type='file']");
		expect(input).not.toBeNull();

		const file = new File(["%PDF"], "notes.pdf", { type: "application/pdf" });
		fireEvent.change(input as HTMLInputElement, {
			target: { files: [file] },
		});

		await waitFor(() => expect(convertPdfMock).toHaveBeenCalledWith(file));
		expect(scanImageMock).toHaveBeenCalledWith(converted);
	});

	it("does not scan when PDF conversion fails", async () => {
		convertPdfMock.mockRejectedValueOnce(new Error("conversion failed"));

		const { container } = render(<CurationPanel subject={Subject.ENGLISH} />);
		const input = container.querySelector("input[type='file']");
		expect(input).not.toBeNull();

		const file = new File(["%PDF"], "broken.pdf", { type: "application/pdf" });
		fireEvent.change(input as HTMLInputElement, {
			target: { files: [file] },
		});

		await waitFor(() => expect(convertPdfMock).toHaveBeenCalledWith(file));
		expect(scanImageMock).not.toHaveBeenCalled();
	});
});
