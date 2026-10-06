import {
	ArrowRight,
	Camera,
	Check,
	ChevronDown,
	ChevronUp,
	FileText,
	Info,
	Loader2,
	Plus,
	RefreshCw,
	Search,
	Sparkles,
	Table2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import type { PSM } from "tesseract.js";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { FileUploader } from "@/components/ui/file-upload";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useOCR } from "@/hooks/use-ocr";
import { findMatches, findRecommendedSubject } from "@/lib/content-mapper";
import {
	cleanOcrText,
	detectTextTableCandidates,
	type OcrInsertionOptions,
} from "@/lib/ocr-postprocess";
import { convertFirstPdfPageToImageFile, isPdfFile } from "@/lib/pdf-to-image";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";
import { Subject } from "@/types/lesson";
import type { CurriculumItem } from "../lesson.types";

interface CurationPanelProps {
	subject: Subject;
	grade?: number;
	linkedIds?: string[];
	onApplyMetadata?: (match: CurriculumItem) => void;
	onQuickApply?: (
		match: CurriculumItem,
		ocrText: string,
		options?: OcrInsertionOptions,
	) => void;
	onLinkToggle?: (match: CurriculumItem, isLinked: boolean) => void;
	onInsertText?: (
		text: string,
		topic?: string,
		options?: OcrInsertionOptions,
	) => void;
	onInsertImage?: (dataUrl: string) => void;
	onSubjectRecommendation?: (subject: Subject) => void;
}

export function CurationPanel({
	subject,
	grade,
	linkedIds = [],
	onApplyMetadata,
	onQuickApply,
	onLinkToggle,
	onInsertText,
	onInsertImage,
	onSubjectRecommendation,
}: CurationPanelProps) {
	// OCR parameters
	const [usePreprocessing, setUsePreprocessing] = useState(true);
	const [psmMode] = useState<number>(3); // Default to 3 (Auto)
	const [ocrLanguage, setOcrLanguage] = useState<string>(
		subject === Subject.ENGLISH ? "eng" : "eng+sin",
	);

	const {
		text: rawOcrText,
		tableCandidates,
		confidence,
		filteredLineCount,
		uncertainText,
		uncertainLineCount,
		progress,
		status,
		scanImage,
		reset: resetOCR,
	} = useOCR({
		preprocess: usePreprocessing,
		pageSegmentationMode: psmMode as unknown as PSM,
		language: ocrLanguage,
		preserveStandaloneNumbers: subject === Subject.MATH,
		subject,
	});

	// Editable text state
	const [ocrText, setOcrText] = useState("");
	const [selectedTableIds, setSelectedTableIds] = useState<Set<string>>(
		new Set(),
	);
	const [headerTableIds, setHeaderTableIds] = useState<Set<string>>(new Set());
	// Manual search state
	const [searchQuery, setSearchQuery] = useState("");
	const [isSearchingManual, setIsSearchingManual] = useState(false);

	const [matches, setMatches] = useState<CurriculumItem[]>([]);
	const [step, setStep] = useState<"scan" | "match">("scan");
	const [isCameraActive, setIsCameraActive] = useState(false);
	const videoRef = useRef<HTMLVideoElement | null>(null);
	const streamRef = useRef<MediaStream | null>(null);

	const startCamera = async () => {
		try {
			if (streamRef.current) {
				stopCamera();
			}
			const stream = await navigator.mediaDevices.getUserMedia({
				video: { facingMode: "environment" },
			});
			streamRef.current = stream;
			if (videoRef.current) {
				videoRef.current.srcObject = stream;
				videoRef.current.play();
			}
			setIsCameraActive(true);
		} catch (err) {
			toast.error("Could not access camera");
			console.error(err);
		}
	};

	const stopCamera = () => {
		if (streamRef.current) {
			for (const track of streamRef.current.getTracks()) {
				track.stop();
			}
			streamRef.current = null;
		}
		setIsCameraActive(false);
	};

	const capturePhoto = () => {
		const video = videoRef.current;
		if (!video) return;
		const canvas = document.createElement("canvas");
		canvas.width = video.videoWidth || 640;
		canvas.height = video.videoHeight || 480;
		const ctx = canvas.getContext("2d");
		if (ctx) {
			ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
			canvas.toBlob((blob) => {
				if (blob) {
					const file = new File([blob], "camera-capture.png", {
						type: "image/png",
					});
					setUploadedFile(file);
					void scanImage(file);
					stopCamera();
				}
			}, "image/png");
		}
	};

	useEffect(() => {
		return () => {
			if (streamRef.current) {
				for (const track of streamRef.current.getTracks()) {
					track.stop();
				}
			}
		};
	}, []);

	const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
	const [uploadedFile, setUploadedFile] = useState<File | null>(null);

	useEffect(() => {
		if (!uploadedFile) {
			setOcrLanguage(subject === Subject.ENGLISH ? "eng" : "eng+sin");
		}
	}, [subject, uploadedFile]);

	const lastProcessedTextRef = useRef<string>("");
	const lastMatchTextRef = useRef<string>("");
	const matchRequestRef = useRef(0);
	const prevPreprocessingRef = useRef(usePreprocessing);
	const prevPsmModeRef = useRef(psmMode);
	const prevOcrLanguageRef = useRef(ocrLanguage);

	// Visual Cropper State
	const [isCropping, setIsCropping] = useState(false);
	const [imageUrl, setImageUrl] = useState<string | null>(null);
	const [cropStart, setCropStart] = useState<{ x: number; y: number } | null>(
		null,
	);
	const [cropCurrent, setCropCurrent] = useState<{
		x: number;
		y: number;
	} | null>(null);
	const [cropRect, setCropRect] = useState<{
		left: number;
		top: number;
		width: number;
		height: number;
	} | null>(null);

	const previewImgRef = useRef<HTMLImageElement | null>(null);

	// Sync local state when OCR completes
	useEffect(() => {
		if (rawOcrText) {
			setOcrText(cleanOcrText(rawOcrText, ocrLanguage));
		}
	}, [rawOcrText, ocrLanguage]);

	const activeTableCandidates = useMemo(() => {
		const reviewed = cleanOcrText(ocrText, ocrLanguage);
		const original = cleanOcrText(rawOcrText, ocrLanguage);
		return reviewed === original
			? tableCandidates
			: detectTextTableCandidates(reviewed);
	}, [ocrLanguage, ocrText, rawOcrText, tableCandidates]);

	useEffect(() => {
		setSelectedTableIds(
			new Set(
				activeTableCandidates
					.filter((candidate) => candidate.autoConvert)
					.map((candidate) => candidate.id),
			),
		);
		setHeaderTableIds(new Set());
		// Candidate IDs change when reviewed text changes, invalidating stale layout.
	}, [activeTableCandidates]);

	const insertionOptions = useCallback(
		(): OcrInsertionOptions => ({
			language: ocrLanguage,
			tableCandidates: activeTableCandidates,
			tableSelections: activeTableCandidates
				.filter((candidate) => selectedTableIds.has(candidate.id))
				.map((candidate) => ({
					candidateId: candidate.id,
					withHeaderRow: headerTableIds.has(candidate.id),
				})),
		}),
		[activeTableCandidates, headerTableIds, ocrLanguage, selectedTableIds],
	);

	// Re-run scan when settings change and we have a scanned image
	useEffect(() => {
		const settingsChanged =
			prevPreprocessingRef.current !== usePreprocessing ||
			prevPsmModeRef.current !== psmMode ||
			prevOcrLanguageRef.current !== ocrLanguage;

		prevPreprocessingRef.current = usePreprocessing;
		prevPsmModeRef.current = psmMode;
		prevOcrLanguageRef.current = ocrLanguage;

		if (uploadedFile && settingsChanged && status !== "loading") {
			scanImage(uploadedFile);
		}
	}, [usePreprocessing, psmMode, ocrLanguage, uploadedFile, scanImage, status]);

	// Handle object URL for preview
	useEffect(() => {
		if (uploadedFile) {
			const url = URL.createObjectURL(uploadedFile);
			setImageUrl(url);
			return () => {
				URL.revokeObjectURL(url);
			};
		}
		setImageUrl(null);
	}, [uploadedFile]);

	const runMatchSearch = useCallback(
		async (
			textToSearch: string,
			options: { notifyEmpty?: boolean; showNoMatchesToast?: boolean } = {},
		) => {
			const trimmedText = textToSearch.trim();
			if (!trimmedText) {
				if (options.notifyEmpty) {
					toast.warning(m.lessons_analyze_warning_no_text());
				}
				return;
			}

			const requestId = matchRequestRef.current + 1;
			matchRequestRef.current = requestId;
			lastMatchTextRef.current = trimmedText;

			try {
				const results = await findMatches(trimmedText, subject, grade);
				if (matchRequestRef.current !== requestId) return;

				setMatches(results);
				if (results.length === 0 && options.showNoMatchesToast) {
					toast.info(m.lessons_analyze_info_no_matches({ subject }));
				}
			} catch (error) {
				toast.error(m.lessons_analyze_error());
				console.error(error);
			}
		},
		[subject, grade],
	);

	useEffect(() => {
		const textToRefresh = lastMatchTextRef.current;
		if (!textToRefresh) return;

		runMatchSearch(textToRefresh);
	}, [runMatchSearch]);

	const handleFileUpload = async (files: File[]) => {
		if (files.length === 0) return;
		const originalFile = files[0];

		try {
			const file = isPdfFile(originalFile)
				? await convertFirstPdfPageToImageFile(originalFile)
				: originalFile;

			if (isPdfFile(originalFile)) {
				toast.info(m.lessons_pdf_first_page_notice());
			}

			setUploadedFile(file);
			await scanImage(file);
			toast.success(m.lessons_ocr_success());
		} catch (error) {
			toast.error(m.lessons_ocr_error());
			console.error(error);
		}
	};

	const handleFindMatches = useCallback(
		(overrideText?: string | React.MouseEvent) => {
			const textToSearch =
				typeof overrideText === "string" ? overrideText : ocrText;

			void runMatchSearch(textToSearch, {
				notifyEmpty: true,
				showNoMatchesToast: true,
			});
		},
		[ocrText, runMatchSearch],
	);

	const recommendSubject = useCallback(
		async (text: string) => {
			if (!onSubjectRecommendation) return;
			const recommendation = await findRecommendedSubject(text, subject, grade);
			if (recommendation) {
				onSubjectRecommendation(recommendation.subject);
			}
		},
		[grade, onSubjectRecommendation, subject],
	);

	// Auto-find matches when text is updated from OCR
	useEffect(() => {
		if (
			status === "success" &&
			rawOcrText &&
			rawOcrText !== lastProcessedTextRef.current
		) {
			const cleaned = cleanOcrText(rawOcrText, ocrLanguage);
			lastProcessedTextRef.current = rawOcrText;
			handleFindMatches(cleaned);
			void recommendSubject(cleaned);
		}
	}, [status, rawOcrText, ocrLanguage, handleFindMatches, recommendSubject]);

	const handleManualSearch = async (e: React.SubmitEvent<HTMLFormElement>) => {
		e.preventDefault();
		if (!searchQuery.trim()) return;

		setIsSearchingManual(true);
		try {
			await runMatchSearch(searchQuery, { showNoMatchesToast: true });
		} finally {
			setIsSearchingManual(false);
		}
	};

	const handleCropMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
		if (!isCropping) return;
		const rect = e.currentTarget.getBoundingClientRect();
		const x = e.clientX - rect.left;
		const y = e.clientY - rect.top;
		setCropStart({ x, y });
		setCropCurrent({ x, y });
		setCropRect(null);
	};

	const handleCropMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
		if (!isCropping || !cropStart) return;
		const rect = e.currentTarget.getBoundingClientRect();
		const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
		const y = Math.max(0, Math.min(rect.height, e.clientY - rect.top));
		setCropCurrent({ x, y });
	};

	const handleCropMouseUp = () => {
		if (!isCropping || !cropStart || !cropCurrent) return;
		const left = Math.min(cropStart.x, cropCurrent.x);
		const top = Math.min(cropStart.y, cropCurrent.y);
		const width = Math.abs(cropStart.x - cropCurrent.x);
		const height = Math.abs(cropStart.y - cropCurrent.y);

		if (width > 10 && height > 10) {
			setCropRect({ left, top, width, height });
		} else {
			setCropRect(null);
		}
		setCropStart(null);
		setCropCurrent(null);
	};

	const executeCrop = () => {
		const img = previewImgRef.current;
		const rect = cropRect;
		if (!img || !rect || !onInsertImage) return;

		const scaleX = img.naturalWidth / img.clientWidth;
		const scaleY = img.naturalHeight / img.clientHeight;

		const sourceWidth = rect.width * scaleX;
		const sourceHeight = rect.height * scaleY;
		const outputScale = Math.min(1, 1200 / Math.max(sourceWidth, sourceHeight));
		const canvas = document.createElement("canvas");
		canvas.width = Math.max(1, Math.round(sourceWidth * outputScale));
		canvas.height = Math.max(1, Math.round(sourceHeight * outputScale));
		const ctx = canvas.getContext("2d");

		if (ctx) {
			ctx.drawImage(
				img,
				rect.left * scaleX,
				rect.top * scaleY,
				sourceWidth,
				sourceHeight,
				0,
				0,
				canvas.width,
				canvas.height,
			);

			// A bounded WebP crop keeps offline lesson JSON substantially smaller
			// than a full-resolution PNG while preserving diagrams teachers select.
			const croppedUrl = canvas.toDataURL("image/webp", 0.78);
			onInsertImage(croppedUrl);
			setCropRect(null);
			setIsCropping(false);
		}
	};

	const toggleExpand = (id: string) => {
		setExpandedIds((prev) => {
			const next = new Set(prev);
			if (next.has(id)) {
				next.delete(id);
			} else {
				next.add(id);
			}
			return next;
		});
	};

	const handleReset = () => {
		stopCamera();
		resetOCR();
		setOcrText("");
		setSelectedTableIds(new Set());
		setHeaderTableIds(new Set());
		setMatches([]);
		setSearchQuery("");
		setUploadedFile(null);
		setIsCropping(false);
		setCropRect(null);
		setStep("scan");
	};

	const restoreUncertainText = () => {
		if (!uncertainText.trim()) return;
		setOcrText((current) =>
			[current.trim(), uncertainText.trim()].filter(Boolean).join("\n\n"),
		);
	};

	const handleQuickApply = (item: CurriculumItem) => {
		if (onQuickApply) {
			onQuickApply(item, ocrText, insertionOptions());
			return;
		}

		if (onApplyMetadata) {
			onApplyMetadata(item);
		}
		const isLinked = linkedIds.includes(item.id);
		if (!isLinked && onLinkToggle) {
			onLinkToggle(item, false);
		}

		if (ocrText && onInsertText) {
			onInsertText(ocrText, item.topic, insertionOptions());
		}
	};

	return (
		<div className="space-y-4 h-full flex flex-col">
			{/* Wizard Progress Steps Indicator */}
			<div className="flex items-center justify-between px-2 py-1 select-none border-b pb-3 mb-2 shrink-0">
				<button
					type="button"
					onClick={() => setStep("scan")}
					className="flex items-center gap-1.5 cursor-pointer outline-none bg-transparent border-0 p-0 text-left"
				>
					<span
						className={cn(
							"h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-bold transition-colors",
							step === "scan"
								? "bg-primary text-primary-foreground font-black"
								: "bg-muted text-muted-foreground",
						)}
					>
						1
					</span>
					<span
						className={cn(
							"text-xs font-semibold select-none",
							step === "scan"
								? "text-foreground font-bold"
								: "text-muted-foreground",
						)}
					>
						{m.curation_step_scan_review()}
					</span>
				</button>
				<div className="h-0.5 flex-1 bg-muted mx-3" />
				<button
					type="button"
					onClick={() => {
						setStep("match");
						if (ocrText) handleFindMatches();
					}}
					className="flex items-center gap-1.5 cursor-pointer outline-none bg-transparent border-0 p-0 text-left"
				>
					<span
						className={cn(
							"h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-bold transition-colors",
							step === "match"
								? "bg-primary text-primary-foreground font-black"
								: "bg-muted text-muted-foreground",
						)}
					>
						2
					</span>
					<span
						className={cn(
							"text-xs font-semibold select-none",
							step === "match"
								? "text-foreground font-bold"
								: "text-muted-foreground",
						)}
					>
						{m.curation_step_link_curriculum()}
					</span>
				</button>
			</div>

			{/* STEP 1: UPLOAD OR CAMERA */}
			{step === "scan" && !uploadedFile && !ocrText && (
				<Card className="border-2 shadow-sm flex-1 flex flex-col justify-between overflow-y-auto">
					<CardHeader className="bg-muted/30 border-b py-3">
						<CardTitle className="text-base font-bold flex justify-between items-center select-none">
							<span>{m.lessons_upload_notes_title()}</span>
						</CardTitle>
					</CardHeader>
					<CardContent className="pt-6 space-y-6 flex-1 flex flex-col justify-center">
						{isCameraActive ? (
							<div className="space-y-4 flex flex-col items-center">
								<div className="relative border rounded-xl overflow-hidden bg-black max-w-full aspect-video w-full flex items-center justify-center shadow-inner">
									<video
										ref={videoRef}
										className="w-full h-full object-cover max-h-[300px]"
										playsInline
										muted
									/>
								</div>
								<div className="flex gap-3 justify-center w-full">
									<Button
										type="button"
										variant="ghost"
										onClick={stopCamera}
										className="h-10 px-4 text-xs font-semibold"
									>
										{m.common_dialog_cancel()}
									</Button>
									<Button
										type="button"
										onClick={capturePhoto}
										className="h-10 px-5 text-xs font-bold gap-2 shadow-md"
									>
										<Camera className="h-4 w-4" />
										{m.curation_capture_page()}
									</Button>
								</div>
							</div>
						) : (
							<div className="space-y-5">
								<FileUploader
									value={[]}
									onValueChange={handleFileUpload}
									dropzoneOptions={{
										maxFiles: 1,
										accept: {
											"image/*": [".png", ".jpg", ".jpeg", ".webp"],
											"application/pdf": [".pdf"],
										},
									}}
									description={m.lessons_upload_notes_description()}
								/>

								<div className="flex flex-col items-center gap-3">
									<div className="flex items-center gap-2 w-full px-4 select-none">
										<hr className="flex-1" />
										<span className="text-[10px] uppercase font-bold text-muted-foreground">
											{m.curation_or()}
										</span>
										<hr className="flex-1" />
									</div>
									<Button
										type="button"
										onClick={startCamera}
										className="w-full h-12 text-sm font-bold gap-2 shadow-md bg-secondary text-secondary-foreground hover:bg-secondary/90"
									>
										<Camera className="h-5 w-5" />
										{m.curation_snap_book_page()}
									</Button>
								</div>
							</div>
						)}

						{/* Advanced OCR Controls */}
						<div className="border rounded-lg p-3 bg-muted/20 text-[11px] space-y-2 mt-4 select-none">
							<span className="font-bold text-muted-foreground uppercase tracking-wider block text-[9px]">
								{m.curation_settings_title()}
							</span>
							<div className="flex flex-wrap items-center gap-x-4 gap-y-2">
								<div className="flex items-center gap-2 font-medium select-none cursor-pointer">
									<Checkbox
										id="preprocess-checkbox"
										checked={usePreprocessing}
										onCheckedChange={(checked) =>
											setUsePreprocessing(!!checked)
										}
									/>
									<label
										htmlFor="preprocess-checkbox"
										className="cursor-pointer select-none"
									>
										{m.curation_optimize_contrast()}
									</label>
								</div>

								<div className="flex items-center gap-2">
									<span className="text-muted-foreground">
										{m.common_language_label()}
									</span>
									<Select
										value={ocrLanguage}
										onValueChange={(val) => setOcrLanguage(val)}
									>
										<SelectTrigger
											size="sm"
											className="h-8 text-xs font-semibold bg-background border px-2 min-w-[110px]"
										>
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="sin">
												{m.curation_language_option_sin()}
											</SelectItem>
											<SelectItem value="eng">
												{m.curation_language_option_eng()}
											</SelectItem>
											<SelectItem value="eng+sin">
												{m.curation_language_option_both()}
											</SelectItem>
										</SelectContent>
									</Select>
								</div>
							</div>
						</div>
					</CardContent>
				</Card>
			)}

			{/* STEP 2: REVIEW TEXT */}
			{step === "scan" && (uploadedFile || ocrText) && (
				<Card className="border-2 shadow-sm flex-1 flex flex-col justify-between overflow-y-auto">
					<CardHeader className="bg-muted/30 border-b py-3 flex flex-row items-center justify-between">
						<CardTitle className="text-base font-bold flex items-center gap-2">
							<span>{m.lessons_extracted_text_title()}</span>
						</CardTitle>
						<Button
							variant="ghost"
							size="sm"
							onClick={handleReset}
							className="h-8 text-xs font-semibold"
						>
							<RefreshCw className="mr-1 h-3.5 w-3.5" />
							{m.curation_clear()}
						</Button>
					</CardHeader>
					<CardContent className="pt-4 space-y-4 flex-1 flex flex-col justify-between">
						{status === "loading" ? (
							<div className="py-12 flex flex-col items-center justify-center text-center space-y-4 flex-1">
								<Loader2 className="h-10 w-10 text-primary animate-spin" />
								<div className="space-y-1 select-none">
									<h4 className="font-bold text-base text-foreground">
										{m.curation_processing_ocr()}
									</h4>
									<p className="text-xs text-muted-foreground pt-1">
										{m.lessons_extracted_text_processing({
											progress: Math.round(progress).toString(),
										})}
									</p>
								</div>
								<Progress
									value={progress}
									className="w-full max-w-[240px] h-2 rounded-full"
								/>
							</div>
						) : (
							<div className="space-y-4 flex-1 flex flex-col">
								{/* Preview image and Cropping panel inside review step */}
								{imageUrl && (
									<div className="space-y-2">
										<div className="flex justify-between items-center select-none">
											<span className="text-[10px] font-bold text-muted-foreground uppercase">
												{m.curation_document_preview()}
											</span>
											{onInsertImage && (
												<Button
													variant={isCropping ? "secondary" : "outline"}
													size="xs"
													onClick={() => {
														setIsCropping(!isCropping);
														setCropRect(null);
													}}
													className="h-7 text-[9px] font-bold px-2"
												>
													{isCropping
														? m.curation_close_crop()
														: m.curation_crop_diagram()}
												</Button>
											)}
										</div>

										{isCropping && (
											<p className="text-[9px] text-muted-foreground select-none">
												{m.curation_crop_mode_help()}
											</p>
										)}

										<div className="relative border rounded-lg overflow-hidden bg-muted/10 max-h-[160px] flex justify-center items-center shrink-0 select-none">
											<div className="relative inline-block">
												<img
													ref={previewImgRef}
													src={imageUrl}
													alt="OCR Source"
													className="max-h-[160px] object-contain select-none pointer-events-none"
													onLoad={() => setCropRect(null)}
												/>

												{isCropping && (
													// biome-ignore lint/a11y/noStaticElementInteractions: crop overlay drag selection
													<div
														role="presentation"
														onMouseDown={handleCropMouseDown}
														onMouseMove={handleCropMouseMove}
														onMouseUp={handleCropMouseUp}
														className="absolute inset-0 cursor-crosshair z-20"
													>
														{cropStart && cropCurrent && (
															<div
																className="absolute border border-dashed border-primary bg-primary/20 pointer-events-none"
																style={{
																	left: Math.min(cropStart.x, cropCurrent.x),
																	top: Math.min(cropStart.y, cropCurrent.y),
																	width: Math.abs(cropStart.x - cropCurrent.x),
																	height: Math.abs(cropStart.y - cropCurrent.y),
																}}
															/>
														)}

														{cropRect && (
															<div
																className="absolute border-2 border-dashed border-primary bg-primary/10 pointer-events-none"
																style={{
																	left: cropRect.left,
																	top: cropRect.top,
																	width: cropRect.width,
																	height: cropRect.height,
																}}
															/>
														)}
													</div>
												)}
											</div>
										</div>

										{isCropping && cropRect && (
											<div className="flex gap-2 justify-end select-none">
												<Button
													size="xs"
													variant="ghost"
													onClick={() => setCropRect(null)}
													className="text-[9px] h-7 px-2"
												>
													{m.curation_crop_cancel_btn()}
												</Button>
												<Button
													size="xs"
													onClick={executeCrop}
													className="text-[9px] h-7 font-bold px-2"
												>
													{m.curation_insert_crop()}
												</Button>
											</div>
										)}
									</div>
								)}

								<div className="flex-1 flex flex-col relative min-h-[180px]">
									<div className="flex items-center justify-between pb-1 select-none">
										<span className="text-[10px] font-bold text-muted-foreground uppercase">
											{m.curation_extracted_draft_text()}
										</span>
										{confidence !== null && (
											<div className="flex items-center gap-1.5">
												{filteredLineCount > 0 && (
													<span className="text-[10px] text-muted-foreground">
														{m.curation_filtered_noise_lines({
															count: filteredLineCount.toString(),
														})}
													</span>
												)}
												<span className="text-[10px] text-green-600 font-bold bg-green-50 px-1.5 py-0.5 rounded border border-green-200">
													{m.curation_accuracy_percent({
														percent: Math.round(confidence).toString(),
													})}
												</span>
											</div>
										)}
									</div>
									<Textarea
										placeholder={m.lessons_extracted_text_placeholder()}
										value={ocrText}
										onChange={(e) => setOcrText(e.target.value)}
										className="flex-1 min-h-[140px] font-sans text-sm leading-relaxed"
									/>
									{activeTableCandidates.length > 0 && (
										<div
											className="mt-3 space-y-2"
											data-testid="ocr-table-candidates"
										>
											{activeTableCandidates.map((candidate) => {
												const isSelected = selectedTableIds.has(candidate.id);
												return (
													<div
														key={candidate.id}
														className="rounded-lg border bg-muted/20 p-3 text-xs"
													>
														<div className="mb-2 flex flex-wrap items-center justify-between gap-2">
															<div className="flex items-center gap-2 font-semibold">
																<Table2 className="size-4 text-primary" />
																{m.curation_possible_table()}
															</div>
															<Badge
																variant={
																	candidate.autoConvert
																		? "default"
																		: "secondary"
																}
															>
																{candidate.autoConvert
																	? m.curation_table_auto_detected()
																	: m.curation_table_needs_review()}
															</Badge>
														</div>
														<div className="max-h-36 overflow-auto rounded border bg-background">
															<table className="w-full min-w-max border-collapse text-left">
																<tbody>
																	{candidate.rows.map((row) => (
																		<tr
																			key={`${candidate.id}-${row.join("\u001f")}`}
																		>
																			{row.map((cell) => (
																				<td
																					key={`${candidate.id}-${row.join("\u001f")}-${cell}`}
																					className="border px-2 py-1.5"
																				>
																					{cell}
																				</td>
																			))}
																		</tr>
																	))}
																</tbody>
															</table>
														</div>
														<div className="mt-2 flex flex-wrap items-center justify-between gap-2">
															{isSelected ? (
																<label
																	htmlFor={`ocr-table-header-${candidate.id}`}
																	className="flex cursor-pointer items-center gap-2"
																>
																	<Checkbox
																		id={`ocr-table-header-${candidate.id}`}
																		checked={headerTableIds.has(candidate.id)}
																		onCheckedChange={(checked) =>
																			setHeaderTableIds((current) => {
																				const next = new Set(current);
																				if (checked) next.add(candidate.id);
																				else next.delete(candidate.id);
																				return next;
																			})
																		}
																	/>
																	{m.curation_table_first_row_header()}
																</label>
															) : (
																<span className="text-muted-foreground">
																	{m.curation_table_kept_as_text()}
																</span>
															)}
															<Button
																type="button"
																size="xs"
																variant={isSelected ? "outline" : "default"}
																onClick={() =>
																	setSelectedTableIds((current) => {
																		const next = new Set(current);
																		if (isSelected) next.delete(candidate.id);
																		else next.add(candidate.id);
																		return next;
																	})
																}
															>
																{isSelected
																	? m.curation_table_keep_text()
																	: m.curation_table_convert()}
															</Button>
														</div>
													</div>
												);
											})}
										</div>
									)}
									{uncertainLineCount > 0 && uncertainText && (
										<details className="mt-3 rounded-md border border-amber-200 bg-amber-50/60 p-3 text-xs dark:border-amber-900 dark:bg-amber-950/20">
											<summary className="cursor-pointer font-semibold text-amber-900 dark:text-amber-200">
												{m.curation_uncertain_lines({
													count: uncertainLineCount.toString(),
												})}
											</summary>
											<pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap font-sans text-muted-foreground">
												{uncertainText}
											</pre>
											<Button
												type="button"
												size="xs"
												variant="outline"
												onClick={restoreUncertainText}
											>
												{m.curation_restore_uncertain()}
											</Button>
										</details>
									)}
								</div>
							</div>
						)}

						{status !== "loading" && (
							<div className="flex justify-between items-center border-t pt-4 shrink-0">
								<Button
									variant="outline"
									onClick={handleReset}
									className="h-10 px-4 text-xs font-semibold"
								>
									{m.curation_back()}
								</Button>
								<div className="flex gap-2">
									{onInsertText && (
										<Button
											type="button"
											variant="outline"
											onClick={() =>
												onInsertText(ocrText, undefined, insertionOptions())
											}
											disabled={!ocrText}
											className="h-10 px-4 text-xs font-semibold"
										>
											<FileText className="mr-1 h-3.5 w-3.5" />
											{m.curation_insert_text()}
										</Button>
									)}
									<Button
										onClick={() => {
											handleFindMatches();
											setStep("match");
										}}
										disabled={!ocrText}
										className="h-10 px-5 text-xs font-bold gap-1 bg-primary text-primary-foreground shadow-md"
									>
										{m.lessons_analyze_content_button()}
										<ArrowRight className="h-3.5 w-3.5" />
									</Button>
								</div>
							</div>
						)}
					</CardContent>
				</Card>
			)}

			{/* STEP 3: CURRICULUM MATCHES */}
			{step === "match" && (
				<Card className="border-2 shadow-sm flex-1 flex flex-col overflow-hidden">
					<CardHeader className="bg-muted/30 border-b py-3 flex flex-row items-center justify-between">
						<CardTitle className="text-base font-bold flex items-center gap-1.5">
							<span>{m.curation_curriculum_suggestions()}</span>
							{matches.length > 0 && (
								<Badge className="bg-primary/10 text-primary hover:bg-primary/15 border-none text-xs">
									{matches.length}
								</Badge>
							)}
						</CardTitle>
						<Button
							variant="ghost"
							size="sm"
							onClick={() => setStep("scan")}
							className="h-8 text-xs font-semibold"
						>
							{m.curation_back_to_edit()}
						</Button>
					</CardHeader>
					<CardContent className="pt-4 flex-1 flex flex-col overflow-hidden space-y-4">
						{/* Manual search */}
						<form onSubmit={handleManualSearch} className="flex gap-2 shrink-0">
							<div className="relative flex-1">
								<Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground z-10" />
								<Input
									type="text"
									placeholder={m.curation_search_placeholder()}
									value={searchQuery}
									onChange={(e) => setSearchQuery(e.target.value)}
									className="pl-9 w-full bg-background h-9 text-xs"
								/>
							</div>
							<Button
								type="submit"
								disabled={isSearchingManual || !searchQuery.trim()}
								size="sm"
								className="h-9 text-xs px-3 font-bold"
							>
								{isSearchingManual ? (
									<Loader2 className="h-3.5 w-3.5 animate-spin" />
								) : (
									m.curation_search_button()
								)}
							</Button>
						</form>

						<ScrollArea className="flex-1 pr-1 overflow-y-auto">
							<div className="space-y-3 pb-2">
								{matches.length === 0 ? (
									<div className="text-center py-10 border rounded-xl bg-muted/10 select-none">
										<Info className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
										<p className="text-sm font-semibold text-foreground">
											{m.curation_no_matches_title()}
										</p>
										<p className="text-xs text-muted-foreground max-w-[220px] mx-auto mt-1">
											{m.curation_no_matches_desc()}
										</p>
									</div>
								) : (
									matches.map((item) => {
										const isLinked = linkedIds.includes(item.id);
										const isExpanded = expandedIds.has(item.id);

										return (
											<div
												key={item.id}
												className={cn(
													"border rounded-xl transition-all duration-200 bg-card overflow-hidden",
													isLinked
														? "border-primary bg-primary/5 shadow-sm"
														: "hover:border-muted-foreground/30 border-muted/70",
												)}
											>
												{/* Header Summary */}
												<div className="w-full p-3 flex items-center justify-between gap-3 text-left select-none hover:bg-accent/10">
													<button
														type="button"
														onClick={() => toggleExpand(item.id)}
														className="space-y-1 flex-1 min-w-0 cursor-pointer outline-none bg-transparent border-0 p-0 text-left"
													>
														<div className="flex flex-wrap items-center gap-1">
															<Badge
																variant="outline"
																className="text-[9px] py-0 px-1 font-semibold uppercase"
															>
																{item.subject}
															</Badge>
															<Badge
																variant="secondary"
																className="text-[9px] py-0 px-1 font-semibold"
															>
																{m.lessons_match_grade({
																	grade: item.grade.toString(),
																})}
															</Badge>
															{item.score !== undefined && (
																<Badge
																	variant="outline"
																	className={cn(
																		"text-[9px] py-0 px-1 font-semibold border-none",
																		item.score >= 5
																			? "bg-green-100 text-green-700"
																			: "bg-blue-100 text-blue-700",
																	)}
																>
																	{m.curation_score_badge({
																		score: Math.round(
																			item.score * 10,
																		).toString(),
																	})}
																</Badge>
															)}
														</div>
														<h4 className="font-bold text-sm text-foreground leading-snug truncate">
															{item.topic}
														</h4>
														{!isExpanded && (
															<p className="text-xs text-muted-foreground line-clamp-1">
																{item.content_summary}
															</p>
														)}
													</button>
													<div className="flex items-center gap-2 shrink-0">
														{isLinked ? (
															<Badge
																variant="secondary"
																className="bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20 py-0.5 px-2 gap-0.5 text-[9px] font-bold"
															>
																<Check className="h-3 w-3" />
																{m.curation_linked_badge()}
															</Badge>
														) : (
															<Button
																size="xs"
																onClick={(e) => {
																	e.stopPropagation();
																	handleQuickApply(item);
																}}
																className="h-7 text-[9px] font-bold gap-1 px-2.5 bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm"
															>
																<Sparkles className="h-3 w-3 text-amber-300 fill-amber-300" />
																{m.curation_quick_apply()}
															</Button>
														)}
														<button
															type="button"
															onClick={() => toggleExpand(item.id)}
															className="text-muted-foreground hover:text-foreground p-1 rounded-full hover:bg-muted"
															aria-label={isExpanded ? "Collapse" : "Expand"}
														>
															{isExpanded ? (
																<ChevronUp className="h-4 w-4" />
															) : (
																<ChevronDown className="h-4 w-4" />
															)}
														</button>
													</div>
												</div>

												{/* Collapsible Details */}
												{isExpanded && (
													<div className="px-3 pb-3 pt-1 border-t bg-muted/10 text-xs space-y-3.5 animate-fadeIn">
														<div className="space-y-0.5">
															<span className="font-semibold text-muted-foreground uppercase text-[9px] tracking-wider block">
																{m.curation_competency_level()}
															</span>
															<p className="text-foreground font-mono">
																{item.competency_level || "N/A"}
															</p>
														</div>

														<div className="space-y-0.5">
															<span className="font-semibold text-muted-foreground uppercase text-[9px] tracking-wider block">
																{m.curation_learning_outcome()}
															</span>
															<p className="text-foreground leading-relaxed">
																{item.learning_outcome}
															</p>
														</div>

														<div className="space-y-0.5">
															<span className="font-semibold text-muted-foreground uppercase text-[9px] tracking-wider block">
																{m.curation_content_summary()}
															</span>
															<p className="text-foreground leading-relaxed">
																{item.content_summary}
															</p>
														</div>

														{item.keywords && item.keywords.length > 0 && (
															<div className="space-y-0.5">
																<span className="font-semibold text-muted-foreground uppercase text-[9px] tracking-wider block">
																	{m.curation_keywords()}
																</span>
																<div className="flex flex-wrap gap-1 pt-0.5">
																	{item.keywords.slice(0, 8).map((kw) => (
																		<Badge
																			key={kw}
																			variant="outline"
																			className="bg-background text-[9px] font-normal"
																		>
																			{kw}
																		</Badge>
																	))}
																	{item.keywords.length > 8 && (
																		<span className="text-[9px] text-muted-foreground self-center">
																			{m.curation_more_keywords({
																				count: String(item.keywords.length - 8),
																			})}
																		</span>
																	)}
																</div>
															</div>
														)}

														{/* Actions Bar */}
														<div className="flex flex-wrap gap-2 pt-2 border-t justify-end">
															{onInsertText && (
																<Button
																	variant="outline"
																	size="sm"
																	onClick={(e) => {
																		e.stopPropagation();
																		onInsertText(ocrText, item.topic);
																	}}
																	className="h-8 text-[10px] font-semibold"
																>
																	<FileText className="mr-1 h-3.5 w-3.5" />
																	{m.curation_insert_content()}
																</Button>
															)}

															{onApplyMetadata && (
																<Button
																	variant="outline"
																	size="sm"
																	onClick={(e) => {
																		e.stopPropagation();
																		onApplyMetadata(item);
																	}}
																	className="h-8 text-[10px] font-semibold"
																>
																	<Sparkles className="mr-1 h-3 w-3 text-amber-500" />
																	{m.curation_apply_metadata()}
																</Button>
															)}

															{onLinkToggle && (
																<Button
																	variant={isLinked ? "destructive" : "default"}
																	size="sm"
																	onClick={(e) => {
																		e.stopPropagation();
																		onLinkToggle(item, isLinked);
																	}}
																	className="h-8 text-[10px] font-bold"
																>
																	{isLinked ? (
																		<>
																			<Plus className="mr-1 h-3.5 w-3.5 rotate-45" />
																			{m.curation_unlink_curriculum()}
																		</>
																	) : (
																		<>
																			<Check className="mr-1 h-3.5 w-3.5" />
																			{m.curation_link_to_lesson()}
																		</>
																	)}
																</Button>
															)}
														</div>
													</div>
												)}
											</div>
										);
									})
								)}
							</div>
						</ScrollArea>
					</CardContent>
				</Card>
			)}
		</div>
	);
}
