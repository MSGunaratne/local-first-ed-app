import { type NodeViewProps, NodeViewWrapper } from "@tiptap/react";
import { CheckCircle2, Plus, Trash2, XCircle } from "lucide-react";
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
}: NodeViewProps) {
	const { question, options, correctAnswer } = node.attrs as {
		question: string;
		options: string[];
		correctAnswer: number;
	};

	const [selectedOption, setSelectedOption] = useState<number | null>(null);
	const [isSubmitted, setIsSubmitted] = useState(false);

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

	return (
		<NodeViewWrapper className="my-4">
			<Card className="border-2 border-primary/20">
				<CardHeader className="pb-3">
					<CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
						Interactive Quiz Block
					</CardTitle>
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
