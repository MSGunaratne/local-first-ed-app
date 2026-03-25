import { ArrowRight, CheckCircle2, Loader2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

interface CurationPanelProps {
	subject: Subject;
	onMatchSelect: (match: CurriculumItem, ocrText: string) => void;
}

export function CurationPanel({ subject, onMatchSelect }: CurationPanelProps) {
	const { text, progress, status, scanImage } = useOCR();
	const [matches, setMatches] = useState<CurriculumItem[]>([]);
	const [activeTab, setActiveTab] = useState<"scan" | "results">("scan");

	// Auto-switch to results tab when matches are found
	useEffect(() => {
		if (matches.length > 0) {
			setActiveTab("results");
		}
	}, [matches]);

	const handleFileUpload = async (files: File[]) => {
		if (files.length === 0) return;
		const file = files[0];
		try {
			await scanImage(file);
			toast.success(m.lessons_ocr_success());
		} catch (error) {
			toast.error(m.lessons_ocr_error());
			console.error(error);
		}
	};

	const handleFindMatches = useCallback(async () => {
		if (!text.trim()) {
			toast.warning(m.lessons_analyze_warning_no_text());
			return;
		}
		try {
			const results = await findMatches(text, subject);
			setMatches(results);
			if (results.length === 0) {
				toast.info(m.lessons_analyze_info_no_matches({ subject }));
			}
		} catch (error) {
			toast.error(m.lessons_analyze_error());
			console.error(error);
		}
	}, [text, subject]);

	// Auto-find matches when text is updated from OCR
	useEffect(() => {
		if (status === "success" && text) {
			handleFindMatches();
		}
	}, [status, text, handleFindMatches]);

	return (
		<div className="space-y-4 h-full flex flex-col">
			<Tabs
				value={activeTab}
				onValueChange={(v) => setActiveTab(v as "scan" | "results")}
				className="w-full"
			>
				<TabsList className="grid w-full grid-cols-2">
					<TabsTrigger value="scan">{m.lessons_scan_tab()}</TabsTrigger>
					<TabsTrigger value="results" disabled={matches.length === 0}>
						{m.lessons_matches_tab()}
					</TabsTrigger>
				</TabsList>

				<TabsContent value="scan" className="space-y-4 mt-4">
					<Card className="border-2 shadow-sm">
						<CardHeader className="bg-muted/30 border-b">
							<CardTitle className="text-base font-bold">
								{m.lessons_upload_notes_title()}
							</CardTitle>
						</CardHeader>
						<CardContent className="pt-6">
							<FileUploader
								value={[]}
								onValueChange={handleFileUpload}
								dropzoneOptions={{
									maxFiles: 1,
									accept: { "image/*": [".png", ".jpg", ".jpeg", ".webp"] },
								}}
								description={m.lessons_upload_notes_description()}
							/>
						</CardContent>
					</Card>

					{status !== "idle" && (
						<Card className="border-2 shadow-md">
							<CardHeader className="bg-muted/30 border-b">
								<CardTitle className="text-base font-bold flex justify-between items-center">
									<span>{m.lessons_extracted_text_title()}</span>
									{status === "loading" && (
										<Badge variant="secondary" className="animate-pulse py-1 px-2">
											<Loader2 className="mr-1 h-3 w-3 animate-spin" />
											{m.lessons_extracted_text_processing({
												progress: progress.toString(),
											})}
										</Badge>
									)}
									{status === "success" && (
										<Badge variant="default" className="bg-green-600 py-1 px-2">
											<CheckCircle2 className="mr-1 h-3 w-3" />
											{m.lessons_extracted_text_complete()}
										</Badge>
									)}
								</CardTitle>
							</CardHeader>
							<CardContent className="space-y-2">
								{status === "loading" && (
									<Progress value={progress} className="w-full h-3 rounded-full" />
								)}
								<Textarea
									placeholder={m.lessons_extracted_text_placeholder()}
									value={text}
									readOnly
									className="min-h-[250px] font-mono text-base bg-muted/20"
								/>
							</CardContent>
							<CardFooter className="pb-6">
								<Button
									onClick={handleFindMatches}
									disabled={!text || status === "loading"}
									className="w-full h-12 text-base font-bold"
									size="lg"
									type="button"
								>
									{m.lessons_analyze_content_button()}{" "}
									<ArrowRight className="ml-2 h-4 w-4" />
								</Button>
							</CardFooter>
						</Card>
					)}
				</TabsContent>

				<TabsContent value="results" className="mt-4">
					<ScrollArea className="h-[500px] pr-4">
						<div className="space-y-3">
							{matches.map((item) => (
								<button
									type="button"
									key={item.id}
									onClick={() => onMatchSelect(item, text)}
									onKeyDown={(e) => {
										if (e.key === "Enter" || e.key === " ") {
											onMatchSelect(item, text);
										}
									}}
									className="w-full group relative border rounded-xl p-4 cursor-pointer transition-all duration-200 hover:border-primary hover:bg-accent/50 text-left"
								>
									<div className="flex items-start justify-between gap-4">
										<div className="space-y-1">
											<div className="flex items-center gap-2">
												<Badge variant="outline" className="text-xs">
													{item.subject}
												</Badge>
												<Badge variant="secondary" className="text-xs">
													{m.lessons_match_grade({
														grade: item.grade.toString(),
													})}
												</Badge>
												<Badge className="bg-green-100 text-green-700 hover:bg-green-100 border-none text-[10px]">
													{m.lessons_match_score({
														score: Math.round(
															(item.score || 0) * 10,
														).toString(),
													})}
												</Badge>
											</div>
											<h4 className="font-semibold text-foreground group-hover:text-primary transition-colors">
												{item.topic}
											</h4>
											<p className="text-xs text-muted-foreground line-clamp-2">
												{item.content_summary}
											</p>
										</div>
										<ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 -translate-x-2 transition-all duration-200 group-hover:opacity-100 group-hover:translate-x-0 mt-2" />
									</div>
								</button>
							))}
						</div>
					</ScrollArea>
				</TabsContent>
			</Tabs>
		</div>
	);
}
