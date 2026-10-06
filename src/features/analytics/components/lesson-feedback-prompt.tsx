import { useMutation } from "@tanstack/react-query";
import { useRouterState } from "@tanstack/react-router";
import { Star } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";
import { analyticsMutations } from "../analytics.queries";
import {
	getLocalStorageItem,
	setLocalStorageItem,
} from "../client/browser-env";
import { getDailyPseudonymousActorId } from "../client/pseudonymous-id";

type LessonFeedbackPromptProps = {
	lessonId: string;
	lessonTitle: string;
	openOnComplete?: boolean;
};

const FEEDBACK_SUBMITTED_PREFIX = "lesson-feedback:submitted";
const FEEDBACK_SNOOZE_PREFIX = "lesson-feedback:snooze";

function getSubmittedKey(lessonId: string) {
	return `${FEEDBACK_SUBMITTED_PREFIX}:${lessonId}`;
}

function getSnoozeKey(lessonId: string) {
	return `${FEEDBACK_SNOOZE_PREFIX}:${lessonId}`;
}

export function LessonFeedbackPrompt({
	lessonId,
	lessonTitle,
	openOnComplete = false,
}: LessonFeedbackPromptProps) {
	const routeTemplate = useRouterState({
		select: (state) => {
			const leafMatch = state.matches[state.matches.length - 1];
			return leafMatch && leafMatch.routeId !== "__root__"
				? leafMatch.routeId
				: "/";
		},
	});
	const [isOpen, setIsOpen] = useState(false);
	const [rating, setRating] = useState<number>(0);
	const [comment, setComment] = useState("");
	const { mutateAsync, isPending } = useMutation(
		analyticsMutations.submitLessonFeedback(),
	);

	const submittedKey = useMemo(() => getSubmittedKey(lessonId), [lessonId]);
	const snoozeKey = useMemo(() => getSnoozeKey(lessonId), [lessonId]);

	useEffect(() => {
		const submitted = getLocalStorageItem(submittedKey) === "1";
		if (submitted) {
			return;
		}

		const snoozeUntilRaw = getLocalStorageItem(snoozeKey);
		const snoozeUntil = snoozeUntilRaw
			? Number.parseInt(snoozeUntilRaw, 10)
			: 0;
		if (Number.isFinite(snoozeUntil) && Date.now() < snoozeUntil) {
			return;
		}

		const timeout = window.setTimeout(() => {
			setIsOpen(true);
		}, 45_000);

		return () => {
			window.clearTimeout(timeout);
		};
	}, [snoozeKey, submittedKey]);

	useEffect(() => {
		if (!openOnComplete) {
			return;
		}

		const submitted = getLocalStorageItem(submittedKey) === "1";
		if (!submitted) {
			setIsOpen(true);
		}
	}, [openOnComplete, submittedKey]);

	function snoozeForADay() {
		setLocalStorageItem(snoozeKey, String(Date.now() + 24 * 60 * 60 * 1000));
		setIsOpen(false);
	}

	async function submitFeedback() {
		if (rating < 1 || rating > 5) {
			toast.error(m.feedback_toast_error());
			return;
		}

		const pseudonymousActorId = await getDailyPseudonymousActorId();
		await mutateAsync({
			lessonId,
			pseudonymousActorId,
			rating,
			comment: comment.trim() || undefined,
			routeTemplate,
		});

		setLocalStorageItem(submittedKey, "1");
		setIsOpen(false);
		toast.success(m.feedback_toast_success());
	}

	if (!isOpen) {
		return null;
	}

	return (
		<>
			{/* Mobile backdrop overlay to prevent background clicks and reduce cognitive noise */}
			<div className="fixed inset-0 z-30 bg-background/50 backdrop-blur-sm md:hidden" />

			<div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 z-40 w-[calc(100%-2rem)] md:w-[384px] mx-auto select-none">
				<Card className="border-primary/20 shadow-2xl backdrop-blur supports-[backdrop-filter]:bg-background/95 max-h-[85vh] overflow-y-auto">
					<CardHeader className="pb-2">
						<CardTitle className="text-base font-bold flex items-center justify-between">
							<span>{m.feedback_title()}</span>
						</CardTitle>
						<p className="text-xs text-muted-foreground line-clamp-1">
							{lessonTitle}
						</p>
					</CardHeader>
					<CardContent className="space-y-4">
						<div className="flex items-center gap-1.5 py-1 justify-center md:justify-start">
							{[1, 2, 3, 4, 5].map((value) => (
								<button
									key={value}
									type="button"
									onClick={() => setRating(value)}
									className="rounded-lg p-2 transition-all hover:bg-muted active:scale-95"
									aria-label={m.feedback_rate_aria({ value })}
								>
									<Star
										className={cn(
											"h-8 w-8 md:h-6 md:w-6 transition-colors",
											value <= rating
												? "fill-yellow-400 text-yellow-500"
												: "text-muted-foreground/60",
										)}
									/>
								</button>
							))}
						</div>
						<Textarea
							placeholder={m.feedback_placeholder()}
							value={comment}
							onChange={(event) => setComment(event.target.value)}
							maxLength={500}
							rows={3}
							className="text-sm"
						/>
						<div className="flex items-center justify-end gap-2 pt-1">
							<Button
								type="button"
								variant="ghost"
								size="sm"
								className="h-10 px-4 text-xs font-semibold"
								onClick={snoozeForADay}
							>
								{m.feedback_later()}
							</Button>
							<Button
								type="button"
								size="sm"
								className="h-10 px-5 text-xs font-bold shadow-sm"
								onClick={() => void submitFeedback()}
								disabled={isPending || rating === 0}
							>
								{isPending ? m.feedback_saving() : m.common_submit()}
							</Button>
						</div>
					</CardContent>
				</Card>
			</div>
		</>
	);
}
