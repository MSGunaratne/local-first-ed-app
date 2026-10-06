// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Subject } from "@/types/lesson";
import { CurationPanel } from "./curation-panel";

const { scanImageMock, convertPdfMock, findMatchesMock, ocrResult } =
	vi.hoisted(() => ({
		scanImageMock: vi.fn(),
		convertPdfMock: vi.fn(),
		findMatchesMock: vi.fn(),
		ocrResult: {
			text: "",
			tableCandidates: [] as Array<{
				id: string;
				rows: string[][];
				sourceText: string;
				confidence: number;
				layoutScore: number;
				hasSpatialEvidence: boolean;
				autoConvert: boolean;
			}>,
			confidence: null as number | null,
			filteredLineCount: 0,
			uncertainText: "",
			uncertainLineCount: 0,
			progress: 0,
			status: "idle",
		},
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
		...ocrResult,
		scanImage: scanImageMock,
		reset: vi.fn(),
	}),
}));

vi.mock("@/lib/content-mapper", () => ({
	findMatches: findMatchesMock,
	findRecommendedSubject: vi.fn(() => Promise.resolve(null)),
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
		ocrResult.text = "";
		ocrResult.tableCandidates = [];
		ocrResult.status = "idle";
		findMatchesMock.mockResolvedValue([]);
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

	it("keeps Scan & Review open when OCR matches arrive", async () => {
		ocrResult.text = "central processing unit";
		ocrResult.status = "success";
		findMatchesMock.mockResolvedValueOnce([
			{
				id: "ICT-GR6-1.1",
				subject: "ict",
				grade: 6,
				competency_level: "1.1",
				topic: "Central Processing Unit",
				learning_outcome: "Identifies CPU components",
				content_summary: "CPU overview",
				keywords: ["CPU"],
				score: 7,
			},
		]);

		const { container } = render(
			<CurationPanel subject={Subject.ICT} grade={6} />,
		);

		await waitFor(() => expect(findMatchesMock).toHaveBeenCalled());
		expect(container.textContent).not.toContain(
			"curation_curriculum_suggestions",
		);
		expect(container.textContent).toContain("curation_extracted_draft_text");
	});

	it("passes approved native table selections without persisting OCR metadata", async () => {
		const onInsertText = vi.fn();
		ocrResult.text = "Input   Output\nKeyboard   Letters\nMouse   Pointer";
		ocrResult.status = "success";
		ocrResult.tableCandidates = [
			{
				id: "table-spatial",
				rows: [
					["Input", "Output"],
					["Keyboard", "Letters"],
					["Mouse", "Pointer"],
				],
				sourceText: ocrResult.text,
				confidence: 88,
				layoutScore: 94,
				hasSpatialEvidence: true,
				autoConvert: true,
			},
		];

		render(<CurationPanel subject={Subject.ICT} onInsertText={onInsertText} />);

		await waitFor(() =>
			expect(screen.getByTestId("ocr-table-candidates")).toBeTruthy(),
		);
		fireEvent.click(screen.getByText("curation_insert_text"));

		expect(onInsertText).toHaveBeenCalledWith(
			ocrResult.text,
			undefined,
			expect.objectContaining({
				language: "eng+sin",
				tableSelections: [
					expect.objectContaining({ candidateId: "table-spatial" }),
				],
			}),
		);
	});
});
