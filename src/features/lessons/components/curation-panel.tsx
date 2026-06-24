import {
	ArrowRight,
	Check,
	CheckCircle2,
	ChevronDown,
	ChevronUp,
	FileText,
	Info,
	Loader2,
	Plus,
	RefreshCw,
	Search,
	Sparkles,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { PSM } from "tesseract.js";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	Card,
	CardContent,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { FileUploader } from "@/components/ui/file-upload";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useOCR } from "@/hooks/use-ocr";
import { findMatches } from "@/lib/content-mapper";
import { m } from "@/paraglide/messages";
import type { Subject } from "@/types/lesson";
import type { CurriculumItem } from "../lesson.types";

const cleanOcrText = (text: string, lang: string): string => {
	let cleaned = text;

	// Remove common noise symbols that Tesseract misinterprets
	cleaned = cleaned.replace(/[@[\]{}~|#]/g, "");

	// If scanning Sinhala only, remove isolated/hallucinated English characters and words
	if (lang === "sin") {
		// Remove English words of length >= 2 that are isolated (hallucinations)
		cleaned = cleaned.replace(/\b[a-zA-Z]{2,}\b/g, "");
		// Remove lone letters like a, b, c, x, y (but preserve numbers and parenthesis)
		cleaned = cleaned.replace(/\b[a-zA-Z]\b/g, "");
	}

	// Clean up whitespace
	cleaned = cleaned.replace(/[ \t]+/g, " ");
	cleaned = cleaned.replace(/\n\s*\n/g, "\n");
	return cleaned.trim();
};

interface CurationPanelProps {
	subject: Subject;
	grade?: number;
	linkedIds?: string[];
	onApplyMetadata?: (match: CurriculumItem) => void;
	onQuickApply?: (match: CurriculumItem, ocrText: string) => void;
	onLinkToggle?: (match: CurriculumItem, isLinked: boolean) => void;
	onInsertText?: (text: string, topic?: string) => void;
	onInsertImage?: (dataUrl: string) => void;
	isEditorEmpty?: boolean;
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
	isEditorEmpty = false,
}: CurationPanelProps) {
	// OCR parameters
	const [usePreprocessing, setUsePreprocessing] = useState(true);
	const [psmMode, setPsmMode] = useState<number>(3); // Default to 3 (Auto)
	const [ocrLanguage, setOcrLanguage] = useState<string>("eng+sin");

	const {
		text: rawOcrText,
		confidence,
		progress,
		status,
		scanImage,
		reset: resetOCR,
	} = useOCR({
		preprocess: usePreprocessing,
		pageSegmentationMode: psmMode as unknown as PSM,
		language: ocrLanguage,
	});

	// Editable text state
	const [ocrText, setOcrText] = useState("");
	// Manual search state
	const [searchQuery, setSearchQuery] = useState("");
	const [isSearchingManual, setIsSearchingManual] = useState(false);

	const [matches, setMatches] = useState<CurriculumItem[]>([]);
	const [activeTab, setActiveTab] = useState<"scan" | "results">("scan");
	const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
	const [uploadedFile, setUploadedFile] = useState<File | null>(null);

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

	// Auto-switch to results tab when matches are found
	useEffect(() => {
		if (matches.length > 0) {
			setActiveTab("results");
		}
	}, [matches]);

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
		const file = files[0];
		setUploadedFile(file);
		try {
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
			if (isEditorEmpty && onInsertText) {
				onInsertText(cleaned);
			}
		}
	}, [
		status,
		rawOcrText,
		ocrLanguage,
		handleFindMatches,
		isEditorEmpty,
		onInsertText,
	]);

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

		const canvas = document.createElement("canvas");
		canvas.width = rect.width * scaleX;
		canvas.height = rect.height * scaleY;
		const ctx = canvas.getContext("2d");

		if (ctx) {
			ctx.drawImage(
				img,
				rect.left * scaleX,
				rect.top * scaleY,
				rect.width * scaleX,
				rect.height * scaleY,
				0,
				0,
				rect.width * scaleX,
				rect.height * scaleY,
			);

			const croppedUrl = canvas.toDataURL("image/png");
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
		resetOCR();
		setOcrText("");
		setMatches([]);
		setSearchQuery("");
		setUploadedFile(null);
		setIsCropping(false);
		setCropRect(null);
		setActiveTab("scan");
	};

	const handleQuickApply = (item: CurriculumItem) => {
		if (onQuickApply) {
			onQuickApply(item, ocrText);
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
			onInsertText(ocrText, item.topic);
		}
	};

	return (
		<div className="space-y-4 h-full flex flex-col">
			<Tabs
				value={activeTab}
				onValueChange={(v) => setActiveTab(v as "scan" | "results")}
				className="w-full"
			>
				<TabsList className="grid w-full grid-cols-2">
					<TabsTrigger value="scan">{m.lessons_scan_tab()}</TabsTrigger>
					<TabsTrigger value="results">
						{m.lessons_matches_tab()}{" "}
						{matches.length > 0 && `(${matches.length})`}
					</TabsTrigger>
				</TabsList>

				<TabsContent value="scan" className="space-y-4 mt-4">
					<Card className="border-2 shadow-sm">
						<CardHeader className="bg-muted/30 border-b py-3 flex flex-row items-center justify-between">
							<CardTitle className="text-base font-bold">
								{m.lessons_upload_notes_title()}
							</CardTitle>
							{status !== "idle" && (
								<Button
									variant="ghost"
									size="sm"
									onClick={handleReset}
									className="h-8 text-xs font-semibold"
								>
									<RefreshCw className="mr-1.5 h-3.5 w-3.5" />
									{m.curation_clear()}
								</Button>
							)}
						</CardHeader>
						<CardContent className="pt-4 space-y-4">
							{imageUrl ? (
								<div className="space-y-3">
									<div className="flex justify-between items-center">
										<span className="text-xs font-semibold text-muted-foreground select-none">
											Document Preview
										</span>
										{onInsertImage && (
											<Button
												variant={isCropping ? "secondary" : "outline"}
												size="xs"
												onClick={() => {
													setIsCropping(!isCropping);
													setCropRect(null);
												}}
												className="h-7 text-[10px] font-semibold"
											>
												{m.curation_crop_mode_toggle()}
											</Button>
										)}
									</div>

									{isCropping && (
										<p className="text-[10px] text-muted-foreground select-none">
											{m.curation_crop_mode_help()}
										</p>
									)}

									<div className="relative border rounded-lg overflow-hidden bg-muted/10 max-h-[300px] flex justify-center items-center">
										<div className="relative inline-block">
											<img
												ref={previewImgRef}
												src={imageUrl}
												alt="OCR Source"
												className="max-h-[300px] object-contain select-none pointer-events-none"
												onLoad={() => {
													// Force re-render to update overlay size on load
													setCropRect(null);
												}}
											/>

											{/* Cropping overlay */}
											{isCropping && (
												// biome-ignore lint/a11y/noStaticElementInteractions: crop overlay drag selection
												<div
													role="presentation"
													onMouseDown={handleCropMouseDown}
													onMouseMove={handleCropMouseMove}
													onMouseUp={handleCropMouseUp}
													className="absolute inset-0 cursor-crosshair z-20"
												>
													{/* Render active dragging selection */}
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

													{/* Render established crop rect */}
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

									{/* Cropper Actions */}
									{isCropping && cropRect && (
										<div className="flex gap-2 justify-end">
											<Button
												size="xs"
												variant="ghost"
												onClick={() => setCropRect(null)}
												className="text-[10px] h-7"
											>
												{m.curation_crop_cancel_btn()}
											</Button>
											<Button
												size="xs"
												onClick={executeCrop}
												className="text-[10px] h-7 font-bold"
											>
												{m.curation_crop_insert_btn()}
											</Button>
										</div>
									)}
								</div>
							) : (
								<FileUploader
									value={[]}
									onValueChange={handleFileUpload}
									dropzoneOptions={{
										maxFiles: 1,
										accept: { "image/*": [".png", ".jpg", ".jpeg", ".webp"] },
									}}
									description={m.lessons_upload_notes_description()}
								/>
							)}

							{/* Advanced OCR Controls */}
							<div className="border rounded-lg p-3 bg-muted/20 text-xs space-y-2 select-none">
								<span className="font-semibold text-muted-foreground uppercase tracking-wider block text-[10px]">
									{m.curation_settings_title()}
								</span>
								<div className="flex flex-wrap items-center gap-4">
									<div className="flex items-center gap-2 font-medium select-none">
										<Checkbox
											id="preprocess-checkbox"
											checked={usePreprocessing}
											onCheckedChange={(checked) =>
												setUsePreprocessing(!!checked)
											}
										/>
										<label
											htmlFor="preprocess-checkbox"
											className="cursor-pointer"
										>
											{m.curation_optimize_contrast()}
										</label>
									</div>

									<div className="flex items-center gap-2">
										<span className="text-muted-foreground">
											{m.curation_language_label()}
										</span>
										<Select
											value={ocrLanguage}
											onValueChange={(val) => setOcrLanguage(val)}
										>
											<SelectTrigger
												size="sm"
												className="h-8 text-xs font-medium bg-background border px-2 min-w-[130px]"
											>
												<SelectValue
													placeholder={m.curation_language_option_sin()}
												/>
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

									<div className="flex items-center gap-2">
										<span className="text-muted-foreground">
											{m.curation_layout_label()}
										</span>
										<Select
											value={String(psmMode)}
											onValueChange={(val) => setPsmMode(Number(val))}
										>
											<SelectTrigger
												size="sm"
												className="h-8 text-xs font-medium bg-background border px-2 min-w-[130px]"
											>
												<SelectValue
													placeholder={m.curation_layout_option_auto()}
												/>
											</SelectTrigger>
											<SelectContent>
												<SelectItem value="3">
													{m.curation_layout_option_auto()}
												</SelectItem>
												<SelectItem value="6">
													{m.curation_layout_option_uniform()}
												</SelectItem>
												<SelectItem value="11">
													{m.curation_layout_option_sparse()}
												</SelectItem>
												<SelectItem value="4">
													{m.curation_layout_option_single_col()}
												</SelectItem>
											</SelectContent>
										</Select>
									</div>
								</div>
							</div>
						</CardContent>
					</Card>

					{status !== "idle" && (
						<Card className="border-2 shadow-md">
							<CardHeader className="bg-muted/30 border-b py-3">
								<CardTitle className="text-base font-bold flex justify-between items-center">
									<span>{m.lessons_extracted_text_title()}</span>
									{status === "loading" && (
										<Badge
											variant="secondary"
											className="animate-pulse py-1 px-2 text-xs"
										>
											<Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
											{m.lessons_extracted_text_processing({
												progress: progress.toString(),
											})}
										</Badge>
									)}
									{status === "success" && (
										<div className="flex items-center gap-1.5">
											{confidence !== null && (
												<Badge
													variant="outline"
													className="py-1 px-2 text-xs bg-background"
												>
													{m.curation_confidence_badge({
														confidence: Math.round(confidence).toString(),
													})}
												</Badge>
											)}
											<Badge
												variant="default"
												className="bg-green-600 py-1 px-2 text-xs"
											>
												<CheckCircle2 className="mr-1 h-3.5 w-3.5" />
												{m.curation_editable_badge()}
											</Badge>
										</div>
									)}
								</CardTitle>
							</CardHeader>
							<CardContent className="space-y-3 pt-4">
								{status === "loading" && (
									<Progress
										value={progress}
										className="w-full h-2.5 rounded-full"
									/>
								)}
								<div className="relative">
									<Textarea
										placeholder={m.lessons_extracted_text_placeholder()}
										value={ocrText}
										onChange={(e) => setOcrText(e.target.value)}
										disabled={status === "loading"}
										className="min-h-[250px] font-sans text-sm focus:ring-primary leading-relaxed"
									/>
									{status === "success" && (
										<div className="absolute bottom-2 right-2 flex items-center text-[10px] text-muted-foreground bg-background/80 px-1.5 py-0.5 rounded border">
											{m.curation_textarea_helper()}
										</div>
									)}
								</div>
							</CardContent>
							<CardFooter className="pb-4 border-t pt-3 flex gap-2 justify-end">
								{onInsertText && (
									<Button
										variant="outline"
										onClick={() => onInsertText(ocrText)}
										disabled={!ocrText || status === "loading"}
										size="sm"
										className="text-xs"
									>
										<FileText className="mr-1.5 h-3.5 w-3.5" />
										{m.curation_insert_to_editor()}
									</Button>
								)}
								<Button
									onClick={handleFindMatches}
									disabled={!ocrText || status === "loading"}
									className="font-bold text-xs"
									size="sm"
								>
									{m.lessons_analyze_content_button()}{" "}
									<ArrowRight className="ml-1.5 h-3.5 w-3.5" />
								</Button>
							</CardFooter>
						</Card>
					)}
				</TabsContent>

				<TabsContent value="results" className="mt-4 space-y-4">
					{/* Search & Input Bar */}
					<form onSubmit={handleManualSearch} className="flex gap-2">
						<div className="relative flex-1">
							<Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground z-10" />
							<Input
								type="text"
								placeholder={m.curation_search_placeholder()}
								value={searchQuery}
								onChange={(e) => setSearchQuery(e.target.value)}
								className="pl-9 w-full bg-background"
							/>
						</div>
						<Button
							type="submit"
							disabled={isSearchingManual || !searchQuery.trim()}
							size="sm"
							className="h-10 text-xs px-3"
						>
							{isSearchingManual ? (
								<Loader2 className="h-3.5 w-3.5 animate-spin" />
							) : (
								m.curation_search_button()
							)}
						</Button>
					</form>

					<ScrollArea className="h-[460px] pr-2">
						<div className="space-y-3">
							{matches.length === 0 ? (
								<div className="text-center py-10 border rounded-xl bg-muted/10">
									<Info className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
									<p className="text-sm font-semibold text-foreground">
										{m.curation_no_matches_title()}
									</p>
									<p className="text-xs text-muted-foreground max-w-[200px] mx-auto mt-1">
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
											className={`border rounded-xl transition-all duration-200 bg-card overflow-hidden ${
												isLinked
													? "border-primary bg-primary/5 shadow-sm"
													: "hover:border-muted-foreground/30 border-muted/70"
											}`}
										>
											{/* Header Summary */}
											<div className="w-full p-3.5 flex items-center justify-between gap-3 text-left select-none hover:bg-accent/10">
												<button
													type="button"
													onClick={() => toggleExpand(item.id)}
													className="space-y-1.5 flex-1 min-w-0 cursor-pointer outline-none bg-transparent border-0 p-0 text-left"
												>
													<div className="flex flex-wrap items-center gap-1.5">
														<Badge
															variant="outline"
															className="text-[10px] py-0 px-1 font-semibold uppercase"
														>
															{item.subject}
														</Badge>
														<Badge
															variant="secondary"
															className="text-[10px] py-0 px-1 font-semibold"
														>
															{m.lessons_match_grade({
																grade: item.grade.toString(),
															})}
														</Badge>
														{item.score !== undefined && (
															<Badge
																variant="outline"
																className={`text-[10px] py-0 px-1 font-semibold border-none ${
																	item.score >= 5
																		? "bg-green-100 text-green-700"
																		: "bg-blue-100 text-blue-700"
																}`}
															>
																{m.curation_score_badge({
																	score: Math.round(item.score * 10).toString(),
																})}
															</Badge>
														)}
														{isLinked && (
															<Badge className="bg-primary text-primary-foreground text-[10px] py-0 px-1 font-semibold gap-0.5">
																<Check className="h-2.5 w-2.5" />
																{m.curation_linked_badge()}
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
															className="bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20 py-1 px-2 gap-1 text-[10px] font-bold"
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
															className="h-7 text-[10px] font-bold gap-1 px-2.5 bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm"
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

											{/* Collapsible Details Panel */}
											{isExpanded && (
												<div className="px-3.5 pb-3.5 pt-1 border-t bg-muted/10 text-xs space-y-3.5 animate-fadeIn">
													<div className="space-y-1">
														<span className="font-semibold text-muted-foreground uppercase text-[9px] tracking-wider block">
															{m.curation_competency_level()}
														</span>
														<p className="text-foreground font-mono">
															{item.competency_level || "N/A"}
														</p>
													</div>

													<div className="space-y-1">
														<span className="font-semibold text-muted-foreground uppercase text-[9px] tracking-wider block">
															{m.curation_learning_outcome()}
														</span>
														<p className="text-foreground leading-relaxed">
															{item.learning_outcome}
														</p>
													</div>

													<div className="space-y-1">
														<span className="font-semibold text-muted-foreground uppercase text-[9px] tracking-wider block">
															{m.curation_content_summary()}
														</span>
														<p className="text-foreground leading-relaxed">
															{item.content_summary}
														</p>
													</div>

													{item.keywords && item.keywords.length > 0 && (
														<div className="space-y-1">
															<span className="font-semibold text-muted-foreground uppercase text-[9px] tracking-wider block">
																{m.curation_keywords()}
															</span>
															<div className="flex flex-wrap gap-1 pt-0.5">
																{item.keywords.slice(0, 8).map((kw) => (
																	<Badge
																		key={kw}
																		variant="outline"
																		className="bg-background text-[10px] font-normal"
																	>
																		{kw}
																	</Badge>
																))}
																{item.keywords.length > 8 && (
																	<span className="text-[10px] text-muted-foreground self-center">
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
																className="h-8 text-[11px] font-semibold"
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
																className="h-8 text-[11px] font-semibold"
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
																className="h-8 text-[11px] font-bold"
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
				</TabsContent>
			</Tabs>
		</div>
	);
}
