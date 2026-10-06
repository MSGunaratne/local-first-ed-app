import { useRouterState } from "@tanstack/react-router";
import { type NodeViewProps, NodeViewWrapper } from "@tiptap/react";
import {
	ArrowDown,
	ArrowUp,
	Check,
	CheckCircle2,
	CircleHelp,
	Pencil,
	Plus,
	Sparkles,
	Trash2,
	XCircle,
} from "lucide-react";
import { useState } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { useAnalytics } from "@/features/analytics/components/analytics-provider";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";

const quizAttrsSchema = z.object({
	id: z.string().nullable().catch(null),
	kind: z.enum(["mcq", "shortAnswer"]).catch("mcq"),
	question: z.string().catch(""),
	options: z.array(z.string()).catch(["", ""]),
	correctAnswer: z.number().int().nonnegative().catch(0),
	acceptedAnswers: z.array(z.string()).catch([""]),
	explanation: z.string().catch(""),
});

const lessonRouteParamsSchema = z.object({ lessonId: z.string().min(1) });

export function normalizeQuizAnswer(value: string) {
	return value
		.normalize("NFC")
		.trim()
		.replace(/\s+/gu, " ")
		.toLocaleLowerCase();
}

export function QuizComponent({
	node,
	updateAttributes,
	editor,
	deleteNode,
}: NodeViewProps) {
	const parsed = quizAttrsSchema.parse(node.attrs);
	const options = parsed.options.length >= 2 ? parsed.options : ["", ""];
	const correctAnswer = Math.min(parsed.correctAnswer, options.length - 1);
	const acceptedAnswers = parsed.acceptedAnswers.length
		? parsed.acceptedAnswers
		: [""];

	const quizId =
		parsed.id ?? `quiz-${normalizeQuizAnswer(parsed.question) || "untitled"}`;
	const { trackEvent } = useAnalytics();
	const [selectedOption, setSelectedOption] = useState<number | null>(null);
	const [shortAnswer, setShortAnswer] = useState("");
	const [isSubmitted, setIsSubmitted] = useState(false);

	const isValid = Boolean(
		parsed.question.trim() &&
			(parsed.kind === "mcq"
				? options.length >= 2 && options.every((option) => option.trim())
				: acceptedAnswers.some((answer) => answer.trim())),
	);

	const [isEditing, setIsEditing] = useState(!isValid);

	const lessonId = useRouterState({
		select: (state) => {
			for (const match of [...state.matches].reverse()) {
				const params = lessonRouteParamsSchema.safeParse(match.params);
				if (params.success) return params.data.lessonId;
			}
			return null;
		},
	});

	const isCorrect =
		parsed.kind === "mcq"
			? selectedOption === correctAnswer
			: acceptedAnswers.some(
					(answer) =>
						normalizeQuizAnswer(answer) === normalizeQuizAnswer(shortAnswer),
				);

	const displayCorrectAnswerText =
		parsed.kind === "mcq" ? options[correctAnswer] : acceptedAnswers[0];

	const submitAnswer = () => {
		if (
			(parsed.kind === "mcq" && selectedOption === null) ||
			(parsed.kind === "shortAnswer" && !shortAnswer.trim())
		) {
			return;
		}
		setIsSubmitted(true);
		trackEvent(
			"interaction",
			{
				interactionType: "quiz_answer",
				quizId,
				question: parsed.question || "Untitled quiz",
				quizKind: parsed.kind,
				selectedOption: parsed.kind === "mcq" ? selectedOption : null,
				selectedAnswer:
					parsed.kind === "mcq"
						? (options[selectedOption ?? 0] ?? null)
						: shortAnswer,
				correctAnswer: parsed.kind === "mcq" ? correctAnswer : null,
				correctAnswerText:
					parsed.kind === "mcq"
						? (options[correctAnswer] ?? null)
						: (acceptedAnswers[0] ?? null),
				isCorrect,
			},
			lessonId ? { lessonId } : undefined,
		);
	};

	// ---------------------------------------------------------
	// STUDENT / PREVIEW VIEW
	// ---------------------------------------------------------
	if (!editor.isEditable) {
		return (
			<NodeViewWrapper className="my-6" contentEditable={false}>
				<Card className="p-0 py-0 border-l-4 border-l-primary/50 shadow-md transition-all duration-300">
					<CardHeader className="flex flex-row items-center justify-between gap-3 border-b bg-muted/5 pb-3">
						<CardTitle className="flex items-center gap-2 text-lg font-bold">
							<CircleHelp className="h-5 w-5 text-primary" />
							{m.lesson_details_quiz_tab()}
						</CardTitle>
					</CardHeader>
					<CardContent className="space-y-5 pt-4">
						<h3 className="text-lg font-medium tracking-tight">
							{parsed.question}
						</h3>
						{parsed.kind === "mcq" ? (
							<RadioGroup
								value={selectedOption?.toString()}
								onValueChange={(value) =>
									!isSubmitted && setSelectedOption(Number(value))
								}
								className="space-y-2"
							>
								{options.map((option, index) => {
									const optionId = `${quizId}-opt-${index}`;
									return (
										<Label
											key={optionId}
											htmlFor={optionId}
											className={cn(
												"flex cursor-pointer items-center gap-3 rounded-lg border p-4 transition-all duration-200 hover:bg-muted/40",
												isSubmitted &&
													index === correctAnswer &&
													"border-green-500 bg-green-500/10 text-green-700 dark:text-green-300",
												isSubmitted &&
													index === selectedOption &&
													index !== correctAnswer &&
													"border-red-500 bg-red-500/10 text-red-700 dark:text-red-300",
											)}
										>
											<RadioGroupItem
												id={optionId}
												value={index.toString()}
												disabled={isSubmitted}
											/>
											<span className="flex-1 font-medium">{option}</span>
										</Label>
									);
								})}
							</RadioGroup>
						) : (
							<div className="space-y-2">
								<Label htmlFor={`${quizId}-answer`} className="font-semibold">
									{m.quiz_student_your_answer()}
								</Label>
								<Input
									id={`${quizId}-answer`}
									value={shortAnswer}
									onChange={(event) =>
										!isSubmitted && setShortAnswer(event.target.value)
									}
									disabled={isSubmitted}
									className="h-11 focus-visible:ring-primary"
								/>
							</div>
						)}
						{!isSubmitted ? (
							<Button
								type="button"
								onClick={submitAnswer}
								disabled={
									parsed.kind === "mcq"
										? selectedOption === null
										: !shortAnswer.trim()
								}
								className="px-6 py-5 shadow-md hover:shadow-lg transition-all"
							>
								{m.quiz_student_check_answer()}
							</Button>
						) : (
							<div
								className={cn(
									"flex flex-col gap-3 rounded-xl p-4 text-sm shadow-inner transition-all duration-300 animate-in fade-in zoom-in-95",
									isCorrect
										? "bg-green-50 border border-green-200 text-green-800 dark:bg-green-950/20 dark:border-green-900/50 dark:text-green-300"
										: "bg-red-50 border border-red-200 text-red-800 dark:bg-red-950/20 dark:border-red-900/50 dark:text-red-300",
								)}
							>
								<div className="flex items-center gap-2 font-bold text-base">
									{isCorrect ? (
										<CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
									) : (
										<XCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
									)}
									<span>
										{isCorrect
											? m.quiz_student_correct()
											: parsed.kind === "shortAnswer"
												? m.quiz_student_accepted_answer({
														answer: displayCorrectAnswerText,
													})
												: m.quiz_student_incorrect()}
									</span>
								</div>
								{parsed.explanation && (
									<p className="opacity-90 border-t border-current/10 pt-2 leading-relaxed text-xs sm:text-sm">
										{parsed.explanation}
									</p>
								)}
								<Button
									type="button"
									variant="link"
									className="ml-auto text-inherit font-bold h-auto p-0"
									onClick={() => {
										setIsSubmitted(false);
										setSelectedOption(null);
										setShortAnswer("");
									}}
								>
									{m.quiz_student_try_again()}
								</Button>
							</div>
						)}
					</CardContent>
				</Card>
			</NodeViewWrapper>
		);
	}

	// ---------------------------------------------------------
	// EDITOR PREVIEW / READ-ONLY VIEW
	// ---------------------------------------------------------
	if (!isEditing) {
		return (
			<NodeViewWrapper className="my-4" contentEditable={false}>
				<Card className="p-0 py-0 overflow-hidden border border-input shadow-sm transition-all duration-300 hover:shadow-md">
					<CardHeader className="flex flex-row items-center justify-between gap-3 border-b bg-muted/20 px-4 py-3">
						<div className="flex min-w-0 items-center gap-3">
							<div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
								<CircleHelp className="h-5 w-5" />
							</div>
							<div className="min-w-0">
								<CardTitle className="text-sm font-semibold">
									{m.quiz_editor_title()}
								</CardTitle>
								<p className="text-xs text-muted-foreground">
									{parsed.kind === "mcq"
										? m.quiz_type_mcq()
										: m.quiz_type_short()}
								</p>
							</div>
						</div>
						<div className="flex shrink-0 items-center gap-1">
							<Button
								type="button"
								variant="ghost"
								size="sm"
								onClick={() => setIsEditing(true)}
								className="h-8"
							>
								<Pencil className="mr-1 h-3.5 w-3.5" />
								{m.quiz_btn_edit()}
							</Button>
							<Button
								type="button"
								variant="ghost"
								size="icon"
								onClick={deleteNode}
								aria-label={m.quiz_btn_delete()}
								className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive shrink-0"
							>
								<Trash2 className="h-4 w-4" />
							</Button>
						</div>
					</CardHeader>
					<CardContent className="space-y-3 p-4 pt-4">
						<p className="font-semibold text-base leading-snug">
							{parsed.question}
						</p>
						{parsed.kind === "mcq" ? (
							<ul className="space-y-1.5 pl-2 text-sm">
								{options.map((opt, i) => (
									<li
										key={`${quizId}-preview-${i}`}
										className={cn(
											"flex items-center gap-2 rounded px-2 py-1",
											i === correctAnswer
												? "bg-green-500/10 border border-green-500/30 text-green-700 dark:text-green-300 font-semibold"
												: "text-muted-foreground",
										)}
									>
										<div
											className={cn(
												"h-2 w-2 rounded-full",
												i === correctAnswer ? "bg-green-500" : "bg-muted",
											)}
										/>
										<span>{opt}</span>
										{i === correctAnswer && (
											<span className="ml-auto text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-green-500/20 text-green-600 dark:text-green-400">
												{m.quiz_correct_badge()}
											</span>
										)}
									</li>
								))}
							</ul>
						) : (
							<div className="text-sm">
								<span className="font-semibold text-muted-foreground mr-2">
									{m.quiz_short_accepted_answers()}:
								</span>
								<span className="bg-primary/5 border border-primary/20 rounded px-2 py-0.5 text-xs font-medium">
									{acceptedAnswers.join(" · ")}
								</span>
							</div>
						)}
					</CardContent>
				</Card>
			</NodeViewWrapper>
		);
	}

	// ---------------------------------------------------------
	// EDITOR WRITER / BUILDER INTERFACE
	// ---------------------------------------------------------
	const updateOption = (index: number, value: string) => {
		const next = options.map((option, optionIndex) =>
			optionIndex === index ? value : option,
		);
		updateAttributes({ options: next });
	};

	const removeOption = (index: number) => {
		if (options.length <= 2) return;
		const next = options.filter((_, i) => i !== index);
		const nextCorrect =
			index === correctAnswer
				? 0
				: index < correctAnswer
					? correctAnswer - 1
					: correctAnswer;
		updateAttributes({
			options: next,
			correctAnswer: nextCorrect,
		});
	};

	const moveOption = (index: number, direction: "up" | "down") => {
		const targetIndex = direction === "up" ? index - 1 : index + 1;
		if (targetIndex < 0 || targetIndex >= options.length) return;

		const nextOptions = [...options];

		// Swap values
		const temp = nextOptions[index];
		nextOptions[index] = nextOptions[targetIndex];
		nextOptions[targetIndex] = temp;

		// Move selection if target or current was correct
		let nextCorrect = correctAnswer;
		if (correctAnswer === index) {
			nextCorrect = targetIndex;
		} else if (correctAnswer === targetIndex) {
			nextCorrect = index;
		}

		updateAttributes({
			options: nextOptions,
			correctAnswer: nextCorrect,
		});
	};

	const updateAccepted = (index: number, value: string) => {
		const next = acceptedAnswers.map((ans, i) => (i === index ? value : ans));
		updateAttributes({ acceptedAnswers: next });
	};

	const addOption = () => {
		const next = [...options, ""];
		updateAttributes({ options: next });
	};

	const addAccepted = () => {
		const next = [...acceptedAnswers, ""];
		updateAttributes({ acceptedAnswers: next });
	};

	return (
		<NodeViewWrapper className="my-4" contentEditable={false}>
			<Card className="p-0 py-0 overflow-hidden border-2 border-primary/40 shadow-md">
				{/* Header */}
				<CardHeader className="flex flex-row items-center justify-between gap-3 border-b bg-primary/[0.03] px-4 py-3">
					<div className="flex items-center gap-3">
						<div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
							<CircleHelp className="h-5 w-5" />
						</div>
						<div>
							<CardTitle className="text-sm font-bold">
								{m.quiz_editor_title()}
							</CardTitle>
							<p className="text-xs text-muted-foreground">
								{m.quiz_editor_subtitle()}
							</p>
						</div>
					</div>
					<Button
						type="button"
						variant="ghost"
						size="icon"
						onClick={deleteNode}
						aria-label={m.quiz_btn_delete()}
						className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive shrink-0"
					>
						<Trash2 className="h-4 w-4" />
					</Button>
				</CardHeader>

				<CardContent className="space-y-6 p-5 pt-5">
					<div className="grid gap-5 sm:grid-cols-[180px_1fr]">
						{/* Question Type selection */}
						<div className="space-y-2">
							<Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
								{m.quiz_type_label()}
							</Label>
							<Select
								value={parsed.kind}
								onValueChange={(kind) => {
									if (kind === "mcq" || kind === "shortAnswer") {
										updateAttributes({ kind });
									}
								}}
							>
								<SelectTrigger className="h-10">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="mcq">{m.quiz_type_mcq()}</SelectItem>
									<SelectItem value="shortAnswer">
										{m.quiz_type_short()}
									</SelectItem>
								</SelectContent>
							</Select>
						</div>

						{/* Question Input */}
						<div className="space-y-1.5">
							<Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
								{m.quiz_question_label()}
							</Label>
							<Input
								value={parsed.question}
								onChange={(event) =>
									updateAttributes({ question: event.target.value })
								}
								placeholder={m.quiz_question_placeholder()}
								className="h-10 focus-visible:ring-primary text-sm font-medium"
							/>
						</div>
					</div>

					{/* ----------------- MCQ Options Editor ----------------- */}
					{parsed.kind === "mcq" ? (
						<div className="space-y-4">
							<div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-t pt-4">
								<div>
									<Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
										{m.quiz_options_label()}
									</Label>
									<p className="text-[11px] text-muted-foreground">
										{m.quiz_options_instruction()}
									</p>
								</div>

								{/* Template Shortcuts */}
								<div className="flex items-center gap-2 bg-muted/40 rounded-lg p-1 text-xs shrink-0 self-start sm:self-auto border">
									<Sparkles className="h-3.5 w-3.5 text-primary ml-1 shrink-0" />
									<span className="text-[10px] font-medium text-muted-foreground">
										{m.quiz_template_label()}:
									</span>
									<Button
										type="button"
										variant="outline"
										size="sm"
										className="h-6 text-[10px] px-2 py-0"
										onClick={() => {
											updateAttributes({
												options: ["True", "False"],
												correctAnswer: 0,
											});
										}}
									>
										{m.quiz_template_tf()}
									</Button>
									<Button
										type="button"
										variant="outline"
										size="sm"
										className="h-6 text-[10px] px-2 py-0"
										onClick={() => {
											updateAttributes({
												options: ["", "", "", ""],
												correctAnswer: 0,
											});
										}}
									>
										{m.quiz_template_4opt()}
									</Button>
								</div>
							</div>

							<RadioGroup
								value={correctAnswer.toString()}
								onValueChange={(value) =>
									updateAttributes({ correctAnswer: Number(value) })
								}
								className="space-y-2.5"
							>
								{options.map((option, index) => {
									const isCorrectOption = index === correctAnswer;
									return (
										<div
											key={`${quizId}-edit-${index}`}
											className={cn(
												"flex items-start gap-3 rounded-lg border bg-background p-3 transition-all duration-300",
												isCorrectOption
													? "border-green-500 bg-green-50/20 dark:bg-green-950/10 shadow-sm"
													: "border-input hover:border-muted-foreground/30",
											)}
										>
											{/* Radio input */}
											<div className="pt-2">
												<RadioGroupItem
													value={index.toString()}
													id={`${quizId}-correct-${index}`}
													aria-label={`Mark option ${index + 1} as correct`}
													className="h-4 w-4 text-green-600 focus:ring-green-500"
												/>
											</div>

											{/* Option label/index */}
											<span className="w-5 shrink-0 text-center text-xs font-semibold text-muted-foreground pt-2">
												{index + 1}
											</span>

											{/* Option text field */}
											<div className="flex-1 min-w-0">
												<Input
													value={option}
													onChange={(event) =>
														updateOption(index, event.target.value)
													}
													placeholder={m.quiz_option_placeholder({
														num: (index + 1).toString(),
													})}
													aria-label={`Option ${index + 1}`}
													className="w-full border-b border-t-0 border-l-0 border-r-0 rounded-none shadow-none focus-visible:ring-0 focus-visible:border-primary px-1 py-1 h-8 text-sm"
												/>
											</div>

											{/* Action Tools: Sort/Trash */}
											<div className="flex items-center gap-1 shrink-0 pt-0.5">
												{/* Move Up */}
												<Button
													type="button"
													size="icon"
													variant="ghost"
													disabled={index === 0}
													onClick={() => moveOption(index, "up")}
													aria-label="Move option up"
													className="h-7 w-7 text-muted-foreground hover:bg-muted"
												>
													<ArrowUp className="h-3.5 w-3.5" />
												</Button>
												{/* Move Down */}
												<Button
													type="button"
													size="icon"
													variant="ghost"
													disabled={index === options.length - 1}
													onClick={() => moveOption(index, "down")}
													aria-label="Move option down"
													className="h-7 w-7 text-muted-foreground hover:bg-muted"
												>
													<ArrowDown className="h-3.5 w-3.5" />
												</Button>
												{/* Delete */}
												<Button
													type="button"
													size="icon"
													variant="ghost"
													disabled={options.length <= 2}
													onClick={() => removeOption(index)}
													aria-label={`Remove option ${index + 1}`}
													className="h-7 w-7 text-destructive hover:bg-destructive/10 hover:text-destructive"
												>
													<Trash2 className="h-3.5 w-3.5" />
												</Button>
											</div>
										</div>
									);
								})}
							</RadioGroup>
							<Button
								type="button"
								variant="outline"
								size="sm"
								onClick={addOption}
								className="w-full border-dashed border-2 hover:bg-muted/50 h-10 font-medium"
							>
								<Plus className="mr-1 h-4 w-4 text-primary" />
								{m.quiz_add_option()}
							</Button>
						</div>
					) : (
						/* ----------------- Short Answer Editor ----------------- */
						<div className="space-y-4 border-t pt-4">
							<div>
								<Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
									{m.quiz_short_accepted_answers()}
								</Label>
								<p className="text-[11px] text-muted-foreground">
									{m.quiz_short_accepted_instruction()}
								</p>
							</div>

							<div className="space-y-2.5">
								{acceptedAnswers.map((answer, index) => (
									<div
										key={`${quizId}-answer-${index}`}
										className="flex flex-col sm:flex-row sm:items-start gap-3 rounded-lg border bg-background p-3 hover:border-muted-foreground/30 transition-all"
									>
										{/* Input */}
										<div className="flex-1 min-w-0">
											<Input
												value={answer}
												onChange={(event) =>
													updateAccepted(index, event.target.value)
												}
												placeholder={
													index === 0
														? m.quiz_short_correct_placeholder()
														: m.quiz_short_alternative_placeholder({
																num: (index + 1).toString(),
															})
												}
												aria-label={`Accepted answer ${index + 1}`}
												className="w-full border-b border-t-0 border-l-0 border-r-0 rounded-none shadow-none focus-visible:ring-0 focus-visible:border-primary px-1 py-1 h-8 text-sm"
											/>
										</div>

										{/* Delete btn */}
										<Button
											type="button"
											size="icon"
											variant="ghost"
											disabled={acceptedAnswers.length <= 1}
											onClick={() => {
												updateAttributes({
													acceptedAnswers: acceptedAnswers.filter(
														(_, ansIdx) => ansIdx !== index,
													),
												});
											}}
											aria-label={`Remove accepted answer ${index + 1}`}
											className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive shrink-0 self-end sm:self-start"
										>
											<Trash2 className="h-4 w-4" />
										</Button>
									</div>
								))}
							</div>

							<Button
								type="button"
								variant="outline"
								size="sm"
								onClick={addAccepted}
								className="w-full border-dashed border-2 hover:bg-muted/50 h-10 font-medium"
							>
								<Plus className="mr-1 h-4 w-4 text-primary" />
								{m.quiz_short_add_alternative()}
							</Button>
						</div>
					)}

					{/* ----------------- Explanation Input ----------------- */}
					<div className="space-y-1.5 border-t pt-4">
						<Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
							{m.quiz_explanation_label()}
						</Label>
						<Input
							value={parsed.explanation}
							onChange={(event) =>
								updateAttributes({ explanation: event.target.value })
							}
							placeholder={m.quiz_explanation_placeholder()}
							className="h-10 focus-visible:ring-primary text-sm"
						/>
					</div>

					{/* Footer Controls */}
					<div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
						{!isValid ? (
							<p className="text-xs sm:text-sm font-semibold text-destructive">
								{m.quiz_validation_incomplete()}
							</p>
						) : (
							<p className="text-xs sm:text-sm font-medium text-emerald-600 dark:text-emerald-400">
								{m.quiz_validation_ready()}
							</p>
						)}
						<Button
							type="button"
							disabled={!isValid}
							onClick={() => setIsEditing(false)}
							className="sm:min-w-28 font-semibold shadow-md hover:shadow-lg transition-all"
						>
							<Check className="mr-1 h-4 w-4" />
							{m.quiz_btn_done()}
						</Button>
					</div>
				</CardContent>
			</Card>
		</NodeViewWrapper>
	);
}
