import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Calendar, CheckCircle2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Editor } from "@/components/ui/editor";
import { LessonFeedbackPrompt } from "@/features/analytics/components/lesson-feedback-prompt";
import { lessonQueries } from "@/features/lessons/lessons.queries";
import { useLocalProgress } from "@/hooks/use-local-progress";
import { useConnectionMode } from "@/lib/connection-mode";
import { ensureQueryDataAfterRestore } from "@/lib/query-client";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";
import { fDate } from "@/utils/format-time";

export const Route = createFileRoute("/student/lessons/$lessonId")({
	component: LessonPlayer,
	loader: ({ context: { queryClient }, params }) =>
		ensureQueryDataAfterRestore(
			queryClient,
			lessonQueries.publishedDetail(params.lessonId),
		),
});

function LessonPlayer() {
	const params = Route.useParams();
	const { data: lesson } = useSuspenseQuery(
		lessonQueries.publishedDetail(params.lessonId),
	);
	const { markAsStarted, markAsCompleted, getLessonStatus } =
		useLocalProgress();
	const isCompleted = getLessonStatus(lesson.id) === "completed";
	const { isOnline } = useConnectionMode();
	const [fontSize, setFontSize] = useState<"base" | "lg" | "xl">("lg");

	useEffect(() => {
		markAsStarted(lesson.id);
	}, [lesson.id, markAsStarted]);

	return (
		<div className="max-w-4xl mx-auto space-y-8 pb-10">
			<LessonFeedbackPrompt
				lessonId={lesson.id}
				lessonTitle={lesson.title}
				openOnComplete={isCompleted}
			/>

			{/* Offline Sticky Banner */}
			{!isOnline && (
				<div className="bg-amber-500/10 border border-dashed border-amber-300 text-amber-700 dark:text-amber-400 p-3.5 rounded-xl flex items-center justify-between text-xs sm:text-sm font-bold shadow-sm select-none gap-2 shrink-0 animate-pulse">
					<div className="flex items-center gap-2">
						<span className="h-2.5 w-2.5 rounded-full bg-amber-500 animate-ping" />
						<span>
							{m.student_offline_study_mode()} ({m.common_offline()})
						</span>
					</div>
					<Badge
						variant="outline"
						className="border-amber-300 text-amber-700 bg-amber-100 dark:bg-amber-950/20 text-[10px]"
					>
						Cached
					</Badge>
				</div>
			)}

			{/* Navigation */}
			<Link
				to="/student"
				className="inline-flex items-center text-sm text-muted-foreground hover:text-primary transition-colors"
			>
				<ArrowLeft className="mr-2 h-4 w-4" />
				{m.common_back_to_lessons()}
			</Link>

			{/* Header */}
			<div className="space-y-4">
				<div className="flex items-center gap-2">
					<Badge className="capitalize">{lesson.subject}</Badge>
					<Badge variant="outline">
						{m.lessons_grade({ grade: lesson.gradeLevel })}
					</Badge>
					{isCompleted && (
						<Badge
							variant="secondary"
							className="bg-green-500/15 text-green-600 border-green-200"
						>
							{m.common_completed()}
						</Badge>
					)}
				</div>
				<h1 className="text-4xl font-bold tracking-tight text-foreground">
					{lesson.title}
				</h1>
				<div className="flex items-center gap-6 text-sm text-muted-foreground">
					<div className="flex items-center gap-2">
						<ClockIcon className="h-4 w-4" />
						<span>
							{m.common_mins({ count: lesson.estimatedDuration ?? 0 })}
						</span>
					</div>
					<div className="flex items-center gap-2">
						<Calendar className="h-4 w-4" />
						<span>{fDate(lesson.updatedAt)}</span>
					</div>
				</div>
			</div>

			<hr className="border-border" />

			{/* Font size controllers */}
			<div className="flex items-center gap-2 justify-end border-b pb-2 select-none">
				<span className="text-[10px] font-bold text-muted-foreground uppercase">
					{m.student_font_size_label()}
				</span>
				<div className="flex items-center border rounded-lg bg-muted/20 p-0.5">
					<Button
						variant="ghost"
						size="xs"
						onClick={() => setFontSize("base")}
						className={cn(
							"h-7 px-2.5 text-xs font-semibold rounded-md",
							fontSize === "base" &&
								"bg-background text-foreground shadow-sm hover:bg-background",
						)}
					>
						A
					</Button>
					<Button
						variant="ghost"
						size="xs"
						onClick={() => setFontSize("lg")}
						className={cn(
							"h-7 px-2.5 text-sm font-bold rounded-md",
							fontSize === "lg" &&
								"bg-background text-foreground shadow-sm hover:bg-background",
						)}
					>
						A+
					</Button>
					<Button
						variant="ghost"
						size="xs"
						onClick={() => setFontSize("xl")}
						className={cn(
							"h-7 px-2.5 text-base font-black rounded-md",
							fontSize === "xl" &&
								"bg-background text-foreground shadow-sm hover:bg-background",
						)}
					>
						A++
					</Button>
				</div>
			</div>

			{/* Content Renderer */}
			<article
				className={cn(
					"prose prose-slate dark:prose-invert max-w-none transition-all duration-200",
					fontSize === "base"
						? "text-base [&_p]:text-base [&_p]:leading-relaxed"
						: "",
					fontSize === "lg"
						? "text-lg md:text-xl [&_p]:text-lg md:[&_p]:text-xl [&_p]:leading-relaxed font-normal"
						: "",
					fontSize === "xl"
						? "text-xl md:text-2xl [&_p]:text-xl md:[&_p]:text-2xl [&_p]:leading-relaxed font-medium"
						: "",
				)}
			>
				{/* We use the Editor in read-only mode to render the JSON content */}
				{lesson.contentJson ? (
					<Editor
						value={lesson.contentJson}
						onChange={() => {}} // No-op for read-only
						editable={false}
					/>
				) : (
					<div className="text-center py-12 text-muted-foreground">
						{m.common_no_content()}
					</div>
				)}
			</article>

			{/* Completion Action */}
			<div className="flex justify-center pt-8 border-t">
				<Button
					size="lg"
					onClick={() => markAsCompleted(lesson.id)}
					disabled={isCompleted}
					variant={isCompleted ? "outline" : "default"}
					className={
						isCompleted ? "text-green-600 border-green-200 bg-green-50/50" : ""
					}
				>
					{isCompleted ? (
						<>
							<CheckCircle2 className="mr-2 h-5 w-5" />
							{m.common_lesson_completed()}
						</>
					) : (
						m.common_mark_as_completed()
					)}
				</Button>
			</div>
		</div>
	);
}

function ClockIcon(props: React.SVGProps<SVGSVGElement>) {
	return (
		<svg
			{...props}
			xmlns="http://www.w3.org/2000/svg"
			width="24"
			height="24"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			strokeLinecap="round"
			strokeLinejoin="round"
		>
			<title>{m.common_duration()}</title>
			<circle cx="12" cy="12" r="10" />
			<polyline points="12 6 12 12 16 14" />
		</svg>
	);
}
