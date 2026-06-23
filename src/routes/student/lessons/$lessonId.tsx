import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Calendar, CheckCircle2 } from "lucide-react";
import { useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Editor } from "@/components/ui/editor";
import { LessonFeedbackPrompt } from "@/features/analytics/components/lesson-feedback-prompt";
import { lessonQueries } from "@/features/lessons/lessons.queries";
import { useLocalProgress } from "@/hooks/use-local-progress";
import { ensureQueryDataAfterRestore } from "@/lib/query-client";
import { m } from "@/paraglide/messages";
import { fDate } from "@/utils/format-time";

export const Route = createFileRoute("/student/lessons/$lessonId")({
	component: LessonPlayer,
	loader: ({ context: { queryClient }, params }) =>
		ensureQueryDataAfterRestore(
			queryClient,
			lessonQueries.detail(params.lessonId),
		),
});

function LessonPlayer() {
	const params = Route.useParams();
	const { data: lesson } = useSuspenseQuery(
		lessonQueries.detail(params.lessonId),
	);
	const { markAsStarted, markAsCompleted, getLessonStatus } =
		useLocalProgress();
	const isCompleted = getLessonStatus(lesson.id) === "completed";

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

			{/* Content Renderer */}
			<article className="prose prose-slate dark:prose-invert lg:prose-xl max-w-none">
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
