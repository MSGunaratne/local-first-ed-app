import { type NodeViewProps, NodeViewWrapper } from "@tiptap/react";
import {
	Check,
	CheckCircle2,
	Pencil,
	Plus,
	Trash2,
	XCircle,
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";

export function QuizComponent({
	node,
	updateAttributes,
	editor,
	deleteNode,
}: NodeViewProps) {
	const { question, options, correctAnswer } = node.attrs as {
		question: string;
		options: string[];
		correctAnswer: number;
	};

	const [selectedOption, setSelectedOption] = useState<number | null>(null);
	const [isSubmitted, setIsSubmitted] = useState(false);
	const [isEditing, setIsEditing] = useState(() => {
		// Default to edit mode if there is no question yet
		return (
			!question ||
			(question === "" &&
				options.length === 2 &&
				options[0] === "Option 1" &&
				options[1] === "Option 2")
		);
	});

	if (!editor.isEditable) {
		const isCorrect = selectedOption === correctAnswer;

		return (
			<NodeViewWrapper className="my-6">
				<Card className="border-l-4 border-l-primary/50 shadow-sm">
					<CardHeader className="pb-3">
						<CardTitle className="flex items-center gap-2 text-lg font-medium">
							<span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary text-sm">
								?
							</span>
							Quiz
						</CardTitle>
					</CardHeader>
					<CardContent className="space-y-6">
						<div>
							<h3 className="text-lg font-medium leading-none tracking-tight">
								{question || "Untitled Question"}
							</h3>
						</div>

						<RadioGroup
							value={selectedOption?.toString()}
							onValueChange={(val) => {
								if (!isSubmitted) setSelectedOption(parseInt(val, 10));
							}}
							className="space-y-3"
						>
							{options.map((option, index) => {
								let itemClass =
									"flex w-full items-center gap-3 rounded-lg border p-4 transition-all hover:bg-accent hover:text-accent-foreground cursor-pointer";

								if (isSubmitted) {
									if (index === correctAnswer) {
										itemClass =
											"flex w-full items-center gap-3 rounded-lg border border-green-500 bg-green-500/10 p-4 text-green-700";
									} else if (index === selectedOption && !isCorrect) {
										itemClass =
											"flex w-full items-center gap-3 rounded-lg border border-red-500 bg-red-500/10 p-4 text-red-700";
									} else {
										itemClass += " opacity-60";
									}
								} else if (selectedOption === index) {
									itemClass =
										"flex w-full items-center gap-3 rounded-lg border-primary bg-primary/5 p-4 shadow-sm ring-1 ring-primary";
								}

								return (
									<Label
										key={index}
										htmlFor={`opt-${index}`}
										className={itemClass}
									>
										<RadioGroupItem
											value={index.toString()}
											id={`opt-${index}`}
											disabled={isSubmitted}
										/>
										<span className="flex-1 text-base font-normal">
											{option}
										</span>
										{isSubmitted && index === correctAnswer && (
											<CheckCircle2 className="h-5 w-5 text-green-600" />
										)}
										{isSubmitted &&
											index === selectedOption &&
											index !== correctAnswer && (
												<XCircle className="h-5 w-5 text-red-600" />
											)}
									</Label>
								);
							})}
						</RadioGroup>

						{!isSubmitted ? (
							<Button
								onClick={() => setIsSubmitted(true)}
								disabled={selectedOption === null}
								className="w-full sm:w-auto"
							>
								Check Answer
							</Button>
						) : (
							<div
								className={cn(
									"mt-4 flex items-center gap-2 rounded-md p-3 text-sm font-medium",
									isCorrect
										? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300"
										: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
								)}
							>
								{isCorrect ? (
									<>
										<CheckCircle2 className="h-4 w-4" />
										Correct! Great job.
									</>
								) : (
									<>
										<XCircle className="h-4 w-4" />
										Incorrect. The correct answer is highlighted.
									</>
								)}
								<Button
									variant="link"
									className="ml-auto h-auto p-0 text-inherit underline"
									onClick={() => {
										setIsSubmitted(false);
										setSelectedOption(null);
									}}
								>
									Try Again
								</Button>
							</div>
						)}
					</CardContent>
				</Card>
			</NodeViewWrapper>
		);
	}

	// --- Teacher View (Builder) ---
	const handleAddOption = () => {
		updateAttributes({
			options: [...options, `Option ${options.length + 1}`],
		});
	};

	const handleRemoveOption = (index: number) => {
		// Prevent removing if only 2 options left
		if (options.length <= 2) return;

		const newOptions = options.filter((_: string, i: number) => i !== index);

		// Adjust correct answer if we removed an index before or at the current answer
		let newCorrectAnswer = correctAnswer;
		if (index < correctAnswer) {
			newCorrectAnswer--;
		} else if (index === correctAnswer) {
			newCorrectAnswer = 0; // Reset to first if we deleted the correct answer
		}

		updateAttributes({
			options: newOptions,
			correctAnswer: newCorrectAnswer,
		});
	};

	const handleOptionChange = (text: string, index: number) => {
		const newOptions = [...options];
		newOptions[index] = text;
		updateAttributes({ options: newOptions });
	};

	// --- Teacher View (Preview) ---
	if (!isEditing) {
		return (
			<NodeViewWrapper className="my-4">
				<Card className="border border-border bg-card/50 hover:bg-card hover:border-primary/30 transition-all rounded-xl shadow-sm duration-200 relative overflow-hidden group before:absolute before:left-0 before:top-0 before:bottom-0 before:w-1 before:bg-primary/40">
					<CardHeader className="pb-2 pt-3 flex flex-row items-center justify-between space-y-0">
						<div className="flex items-center gap-2">
							<span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-semibold">
								?
							</span>
							<span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
								Quiz Block
							</span>
							<span className="text-[10px] px-1.5 py-0.5 rounded-full bg-secondary text-secondary-foreground font-medium">
								Preview
							</span>
						</div>
						<div className="flex items-center gap-1">
							<Button
								type="button"
								variant="ghost"
								size="sm"
								onClick={() => setIsEditing(true)}
								className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
								title="Edit Quiz"
							>
								<Pencil className="h-3.5 w-3.5" />
								<span>Edit</span>
							</Button>
							<Button
								type="button"
								variant="ghost"
								size="icon"
								onClick={deleteNode}
								className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
								title="Delete Quiz"
							>
								<Trash2 className="h-4 w-4" />
							</Button>
						</div>
					</CardHeader>
					<CardContent className="pb-3 pt-1 space-y-3">
						<p className="font-semibold text-base text-foreground leading-snug">
							{question || (
								<span className="text-muted-foreground italic font-normal">
									Untitled Question
								</span>
							)}
						</p>
						<div className="space-y-1.5">
							{options.map((option: string, index: number) => {
								const isCorrect = index === correctAnswer;
								return (
									<div
										key={index}
										className={cn(
											"flex items-center gap-2.5 rounded-md px-3 py-1.5 text-sm border transition-all",
											isCorrect
												? "bg-green-500/5 text-green-700 dark:text-green-300 border-green-500/20 font-medium"
												: "bg-transparent text-muted-foreground border-transparent",
										)}
									>
										{isCorrect ? (
											<CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400 shrink-0" />
										) : (
											<div className="h-4 w-4 rounded-full border border-muted-foreground/30 shrink-0 flex items-center justify-center">
												<span className="h-1.5 w-1.5 rounded-full bg-transparent" />
											</div>
										)}
										<span className="flex-1 truncate">{option}</span>
										{isCorrect && (
											<span className="text-[10px] uppercase font-semibold tracking-wider text-green-600 dark:text-green-400">
												Correct Answer
											</span>
										)}
									</div>
								);
							})}
						</div>
					</CardContent>
				</Card>
			</NodeViewWrapper>
		);
	}

	return (
		<NodeViewWrapper className="my-4">
			<Card className="border-2 border-primary/30 bg-card rounded-xl shadow-md transition-all duration-200">
				<CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
					<CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground flex items-center gap-2">
						<Pencil className="h-4 w-4 text-primary" />
						Edit Quiz Block
					</CardTitle>
					<div className="flex items-center gap-1">
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={() => setIsEditing(false)}
							className="h-8 gap-1.5 text-xs border-green-500/30 hover:bg-green-500/10 text-green-600 dark:text-green-400 font-medium"
							title="Finish Editing"
						>
							<Check className="h-3.5 w-3.5" />
							<span>Done</span>
						</Button>
						<Button
							type="button"
							variant="ghost"
							size="icon"
							onClick={deleteNode}
							className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
							title="Delete Quiz"
						>
							<Trash2 className="h-4 w-4" />
						</Button>
					</div>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="space-y-2">
						<Label>Question</Label>
						<Input
							value={question}
							onChange={(e) => updateAttributes({ question: e.target.value })}
							placeholder="Enter your question here..."
							className="font-medium text-lg"
						/>
					</div>

					<div className="space-y-2">
						<Label>Options</Label>
						<RadioGroup
							value={correctAnswer.toString()}
							onValueChange={(val) =>
								updateAttributes({ correctAnswer: parseInt(val, 10) })
							}
							className="space-y-2"
						>
							{options.map((option: string, index: number) => (
								<div key={index} className="flex items-center gap-2">
									<RadioGroupItem
										value={index.toString()}
										id={`opt-${index}`}
									/>
									<Input
										value={option}
										onChange={(e) => handleOptionChange(e.target.value, index)}
										className="flex-1"
										placeholder={`Option ${index + 1}`}
									/>
									<Button
										type="button"
										variant="ghost"
										size="icon"
										onClick={() => handleRemoveOption(index)}
										disabled={options.length <= 2}
										className="text-muted-foreground hover:text-destructive"
									>
										<Trash2 className="h-4 w-4" />
									</Button>
								</div>
							))}
						</RadioGroup>
					</div>

					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={handleAddOption}
						className="w-full border-dashed"
					>
						<Plus className="mr-2 h-4 w-4" /> Add Option
					</Button>
				</CardContent>
			</Card>
		</NodeViewWrapper>
	);
}
