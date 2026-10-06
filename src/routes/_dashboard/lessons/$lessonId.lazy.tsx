import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { createLazyFileRoute, Link } from "@tanstack/react-router";
import {
	ArrowLeft,
	BarChart3,
	CheckCircle2,
	ChevronDown,
	Clock,
	Edit,
	Eye,
	Info,
	MessageSquareText,
	Star,
	Target,
	Users,
} from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { analyticsQueries } from "@/features/analytics/analytics.queries";
import { lessonQueries } from "@/features/lessons/lessons.queries";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";
import { SUBJECT_METADATA } from "@/types/lesson";
import { fNumber, fPercent } from "@/utils/format-number";
import { fDate, fDateTime } from "@/utils/format-time";

export const Route = createLazyFileRoute("/_dashboard/lessons/$lessonId")({
	component: LessonDetailsPage,
});

function renderStars(value: number) {
	const rounded = Math.round(value);
	return [1, 2, 3, 4, 5].map((starValue) => (
		<Star
			key={`star-${starValue}`}
			className={
				starValue <= rounded
					? "h-4 w-4 fill-yellow-400 text-yellow-500"
					: "h-4 w-4 text-muted-foreground/50"
			}
		/>
	));
}

function StatCard({
	title,
	value,
	description,
	icon,
}: {
	title: string;
	value: string;
	description: string;
	icon: React.ReactNode;
}) {
	return (
		<Card className="border-2 shadow-sm">
			<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
				<CardTitle className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
					{title}
				</CardTitle>
				<div className="text-muted-foreground">{icon}</div>
			</CardHeader>
			<CardContent>
				<div className="text-3xl font-black">{value}</div>
				<p className="mt-1 text-sm text-muted-foreground">{description}</p>
			</CardContent>
		</Card>
	);
}

function countQuizBlocks(content: unknown) {
	let count = 0;

	function walk(node: unknown) {
		if (typeof node !== "object" || node === null) return;

		if ("type" in node && node.type === "quiz") {
			count += 1;
		}

		if ("content" in node && Array.isArray(node.content)) {
			for (const child of node.content) {
				walk(child);
			}
		}
	}

	walk(content);
	return count;
}

function StatCardSkeleton() {
	return (
		<Card className="border-2 shadow-sm">
			<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
				<Skeleton className="h-4 w-28" />
				<Skeleton className="h-5 w-5 rounded-full" />
			</CardHeader>
			<CardContent className="space-y-2">
				<Skeleton className="h-9 w-20" />
				<Skeleton className="h-4 w-36" />
			</CardContent>
		</Card>
	);
}

function AnalyticsSkeleton({ hasQuiz }: { hasQuiz: boolean }) {
	return (
		<div className="space-y-4">
			<div
				className={
					hasQuiz
						? "grid gap-4 md:grid-cols-2 xl:grid-cols-4"
						: "grid gap-4 md:grid-cols-3"
				}
			>
				<StatCardSkeleton />
				<StatCardSkeleton />
				{hasQuiz && <StatCardSkeleton />}
				<StatCardSkeleton />
			</div>

			<div className="grid gap-4 lg:grid-cols-[360px_1fr]">
				<Card>
					<CardHeader>
						<Skeleton className="h-6 w-40" />
						<Skeleton className="h-4 w-64" />
					</CardHeader>
					<CardContent className="space-y-4">
						<Skeleton className="h-12 w-28" />
						{[5, 4, 3, 2, 1].map((rating) => (
							<div
								key={`rating-skeleton-${rating}`}
								className="grid grid-cols-[3rem_1fr_3rem] items-center gap-2"
							>
								<Skeleton className="h-4 w-10" />
								<Skeleton className="h-2 w-full rounded-full" />
								<Skeleton className="h-4 w-6 justify-self-end" />
							</div>
						))}
					</CardContent>
				</Card>
				<Card>
					<CardHeader>
						<Skeleton className="h-6 w-28" />
						<Skeleton className="h-4 w-72" />
					</CardHeader>
					<CardContent className="space-y-3">
						<Skeleton className="h-20 w-full" />
						<Skeleton className="h-20 w-full" />
						<Skeleton className="h-20 w-4/5" />
					</CardContent>
				</Card>
			</div>
		</div>
	);
}

function NoQuizNotice() {
	return (
		<Card className="border-dashed bg-muted/20">
			<CardContent className="flex items-start gap-3 p-4">
				<Info className="mt-0.5 h-5 w-5 text-muted-foreground" />
				<div className="space-y-1">
					<p className="font-medium">{m.lesson_details_no_quiz_title()}</p>
					<p className="text-sm text-muted-foreground">
						{m.lesson_details_no_quiz_questions()}
					</p>
				</div>
			</CardContent>
		</Card>
	);
}

function LessonDetailsPage() {
	const params = Route.useParams();
	const { data: lesson } = useSuspenseQuery(
		lessonQueries.detail(params.lessonId),
	);
	const analyticsQuery = useQuery(
		analyticsQueries.lessonDetails(params.lessonId),
	);
	const { data } = analyticsQuery;

	const [activeAccordion, setActiveAccordion] = useState<string | null>(
		"feedback",
	);
	const toggleAccordion = (value: string) => {
		setActiveAccordion((prev) => (prev === value ? null : value));
	};
	const lessonQuizCount = countQuizBlocks(lesson.contentJson);
	const hasQuiz = (data?.quiz.authoredQuestionCount ?? lessonQuizCount) > 0;
	const completionRate = data?.progress.completionRate ?? 0;

	return (
		<div className="space-y-6 pb-8">
			<div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
				<div className="space-y-3">
					<Button variant="ghost" className="h-8 px-0" asChild>
						<Link to="/lessons">
							<ArrowLeft className="mr-2 h-4 w-4" />
							{m.common_back_to_lessons()}
						</Link>
					</Button>
					<div className="space-y-2">
						<div className="flex flex-wrap items-center gap-2">
							<Badge className="capitalize">
								{SUBJECT_METADATA[lesson.subject].label}
							</Badge>
							<Badge variant="outline">
								{m.lessons_grade({ grade: lesson.gradeLevel })}
							</Badge>
							<Badge variant={lesson.isPublished ? "secondary" : "outline"}>
								{lesson.isPublished
									? m.lesson_details_published()
									: m.lesson_details_draft()}
							</Badge>
						</div>
						<h1 className="text-3xl font-bold tracking-tight">
							{lesson.title}
						</h1>
						<p className="text-sm text-muted-foreground">
							{m.lesson_details_updated({
								date: fDate(lesson.updatedAt),
							})}
						</p>
					</div>
				</div>
				<div className="flex flex-wrap items-center gap-2">
					{lesson.isPublished && (
						<Button variant="outline" asChild>
							<Link
								to="/student/lessons/$lessonId"
								params={{ lessonId: lesson.id }}
							>
								<Eye className="mr-2 h-4 w-4" />
								{m.common_preview()}
							</Link>
						</Button>
					)}
					<Button asChild>
						<Link to="/lessons/$lessonId/edit" params={{ lessonId: lesson.id }}>
							<Edit className="mr-2 h-4 w-4" />
							{m.common_edit()}
						</Link>
					</Button>
				</div>
			</div>

			{analyticsQuery.isLoading ? (
				<AnalyticsSkeleton hasQuiz={hasQuiz} />
			) : analyticsQuery.isError ? (
				<Card className="border-destructive/40">
					<CardHeader>
						<CardTitle>{m.error_something_went_wrong()}</CardTitle>
						<CardDescription>{m.error_unexpected_desc()}</CardDescription>
					</CardHeader>
				</Card>
			) : data ? (
				<>
					<div
						className={
							hasQuiz
								? "grid gap-4 md:grid-cols-2 xl:grid-cols-4"
								: "grid gap-4 md:grid-cols-3"
						}
					>
						<StatCard
							title={m.lesson_details_rating()}
							value={
								data.feedback.count > 0
									? fNumber(data.feedback.avgRating, {
											minimumFractionDigits: 1,
											maximumFractionDigits: 2,
										})
									: "0"
							}
							description={m.lesson_details_rating_desc({
								count: fNumber(data.feedback.count),
							})}
							icon={<Star className="h-5 w-5" />}
						/>
						<StatCard
							title={m.lesson_details_completion()}
							value={fPercent(completionRate)}
							description={m.lesson_details_completion_desc({
								completed: fNumber(data.progress.completedCount),
								started: fNumber(data.progress.startedCount),
							})}
							icon={<CheckCircle2 className="h-5 w-5" />}
						/>
						{hasQuiz && (
							<StatCard
								title={m.lesson_details_quiz_accuracy()}
								value={fPercent(data.quiz.accuracy)}
								description={m.lesson_details_quiz_accuracy_desc({
									correct: fNumber(data.quiz.correctAttemptCount),
									attempts: fNumber(data.quiz.attemptCount),
								})}
								icon={<Target className="h-5 w-5" />}
							/>
						)}
						<StatCard
							title={m.lesson_details_views()}
							value={fNumber(data.engagement.pageViews)}
							description={m.lesson_details_views_desc({
								days: data.engagement.rawRetentionDays,
							})}
							icon={<Users className="h-5 w-5" />}
						/>
					</div>

					{!hasQuiz && <NoQuizNotice />}

					<div className="space-y-4">
						{/* Feedback Accordion Section */}
						<div className="border border-muted rounded-xl overflow-hidden shadow-sm bg-card">
							<button
								type="button"
								onClick={() => toggleAccordion("feedback")}
								className="w-full p-4 flex items-center justify-between font-bold text-base bg-muted/10 hover:bg-muted/20 border-b transition-colors select-none text-left"
							>
								<div className="flex items-center gap-2">
									<MessageSquareText className="h-5 w-5 text-primary" />
									<span>{m.lesson_details_feedback_tab()}</span>
								</div>
								<ChevronDown
									className={cn(
										"h-4 w-4 text-muted-foreground transition-transform duration-200",
										activeAccordion === "feedback" && "rotate-180",
									)}
								/>
							</button>
							{activeAccordion === "feedback" && (
								<div className="p-4 md:p-6 animate-fadeIn space-y-4">
									<div className="grid gap-4 lg:grid-cols-[360px_1fr]">
										<Card>
											<CardHeader>
												<CardTitle>
													{m.lesson_details_review_summary()}
												</CardTitle>
												<CardDescription>
													{m.lesson_details_review_summary_desc()}
												</CardDescription>
											</CardHeader>
											<CardContent className="space-y-4">
												<div className="flex items-center gap-3">
													<div className="text-4xl font-black">
														{fNumber(data.feedback.avgRating, {
															minimumFractionDigits: 1,
															maximumFractionDigits: 2,
														})}
													</div>
													<div>
														<div className="flex items-center gap-0.5">
															{renderStars(data.feedback.avgRating)}
														</div>
														<p className="mt-1 text-sm text-muted-foreground">
															{m.lesson_details_rating_desc({
																count: fNumber(data.feedback.count),
															})}
														</p>
													</div>
												</div>

												<div className="space-y-2">
													{data.feedback.ratingBreakdown.map((item) => {
														const percent =
															data.feedback.count > 0
																? (item.count / data.feedback.count) * 100
																: 0;

														return (
															<div
																key={item.rating}
																className="grid grid-cols-[3rem_1fr_3rem] items-center gap-2 text-sm"
															>
																<span>{item.rating} star</span>
																<Progress value={percent} />
																<span className="text-right text-muted-foreground">
																	{fNumber(item.count)}
																</span>
															</div>
														);
													})}
												</div>
											</CardContent>
										</Card>

										<Card>
											<CardHeader>
												<CardTitle>{m.lesson_details_comments()}</CardTitle>
												<CardDescription>
													{m.lesson_details_comments_desc()}
												</CardDescription>
											</CardHeader>
											<CardContent>
												<ScrollArea className="h-80 pr-3">
													<div className="space-y-3">
														{data.feedback.recentComments.map((comment) => (
															<div
																key={`${String(comment.createdAt)}-${comment.comment.slice(0, 20)}`}
																className="rounded-lg border bg-muted/30 p-3"
															>
																<div className="flex items-center justify-between gap-3">
																	<div className="flex items-center gap-1">
																		{renderStars(comment.rating)}
																	</div>
																	<span className="text-xs text-muted-foreground">
																		{fDateTime(comment.createdAt)}
																	</span>
																</div>
																<p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">
																	{comment.comment}
																</p>
															</div>
														))}
														{data.feedback.recentComments.length === 0 && (
															<p className="text-sm text-muted-foreground">
																{m.lesson_details_no_comments()}
															</p>
														)}
													</div>
												</ScrollArea>
											</CardContent>
										</Card>
									</div>
								</div>
							)}
						</div>

						{/* Quiz Accordion Section */}
						{hasQuiz && (
							<div className="border border-muted rounded-xl overflow-hidden shadow-sm bg-card">
								<button
									type="button"
									onClick={() => toggleAccordion("quiz")}
									className="w-full p-4 flex items-center justify-between font-bold text-base bg-muted/10 hover:bg-muted/20 border-b transition-colors select-none text-left"
								>
									<div className="flex items-center gap-2">
										<Target className="h-5 w-5 text-primary" />
										<span>{m.lesson_details_quiz_tab()}</span>
									</div>
									<ChevronDown
										className={cn(
											"h-4 w-4 text-muted-foreground transition-transform duration-200",
											activeAccordion === "quiz" && "rotate-180",
										)}
									/>
								</button>
								{activeAccordion === "quiz" && (
									<div className="p-4 md:p-6 animate-fadeIn space-y-4">
										<div className="grid gap-4 lg:grid-cols-[360px_1fr]">
											<Card>
												<CardHeader>
													<CardTitle>
														{m.lesson_details_quiz_progress()}
													</CardTitle>
													<CardDescription>
														{m.lesson_details_quiz_progress_desc({
															days: data.quiz.rawRetentionDays,
														})}
													</CardDescription>
												</CardHeader>
												<CardContent className="space-y-5">
													<div className="space-y-2">
														<div className="flex justify-between text-sm">
															<span className="font-medium">
																{m.lesson_details_answered_questions()}
															</span>
															<span className="text-muted-foreground">
																{fNumber(data.quiz.attemptedQuestionCount)} /{" "}
																{fNumber(data.quiz.authoredQuestionCount)}
															</span>
														</div>
														<Progress
															value={
																data.quiz.authoredQuestionCount > 0
																	? (data.quiz.attemptedQuestionCount /
																			data.quiz.authoredQuestionCount) *
																		100
																	: 0
															}
														/>
													</div>
													<div className="space-y-2">
														<div className="flex justify-between text-sm">
															<span className="font-medium">
																{m.lesson_details_quiz_accuracy()}
															</span>
															<span className="text-muted-foreground">
																{fPercent(data.quiz.accuracy)}
															</span>
														</div>
														<Progress value={data.quiz.accuracy} />
													</div>
												</CardContent>
											</Card>

											<Card>
												<CardHeader>
													<CardTitle>
														{m.lesson_details_question_breakdown()}
													</CardTitle>
													<CardDescription>
														{m.lesson_details_question_breakdown_desc()}
													</CardDescription>
												</CardHeader>
												<CardContent className="p-2 sm:p-6">
													{/* Desktop View Table */}
													<div className="hidden sm:block">
														<Table>
															<TableHeader>
																<TableRow>
																	<TableHead>
																		{m.lesson_details_question()}
																	</TableHead>
																	<TableHead>
																		{m.lesson_details_attempts()}
																	</TableHead>
																	<TableHead>
																		{m.lesson_details_accuracy()}
																	</TableHead>
																	<TableHead>
																		{m.lesson_details_last_answered()}
																	</TableHead>
																</TableRow>
															</TableHeader>
															<TableBody>
																{data.quiz.questions.map((question) => (
																	<TableRow key={question.questionId}>
																		<TableCell className="max-w-[28rem] whitespace-normal font-medium">
																			{question.question}
																		</TableCell>
																		<TableCell>
																			{fNumber(question.attemptCount)}
																		</TableCell>
																		<TableCell>
																			{fPercent(question.accuracy)}
																		</TableCell>
																		<TableCell>
																			{question.lastAnsweredAt
																				? fDateTime(question.lastAnsweredAt)
																				: m.lesson_details_not_answered()}
																		</TableCell>
																	</TableRow>
																))}
																{data.quiz.questions.length === 0 && (
																	<TableRow>
																		<TableCell
																			colSpan={4}
																			className="py-8 text-center text-muted-foreground"
																		>
																			{m.lesson_details_no_quiz_questions()}
																		</TableCell>
																	</TableRow>
																)}
															</TableBody>
														</Table>
													</div>

													{/* Mobile View Cards */}
													<div className="block sm:hidden space-y-3">
														{data.quiz.questions.map((question) => (
															<div
																key={question.questionId}
																className="rounded-xl border bg-muted/10 p-3.5 space-y-2 text-xs"
															>
																<div className="flex flex-col gap-1 border-b pb-2">
																	<span className="text-[10px] font-bold text-muted-foreground uppercase select-none">
																		{m.lesson_details_question()}
																	</span>
																	<p className="font-semibold text-foreground leading-snug">
																		{question.question}
																	</p>
																</div>
																<div className="grid grid-cols-2 gap-2 text-muted-foreground select-none">
																	<div>
																		{m.lesson_details_attempts()}:{" "}
																		<span className="font-bold text-foreground">
																			{fNumber(question.attemptCount)}
																		</span>
																	</div>
																	<div>
																		{m.lesson_details_accuracy()}:{" "}
																		<span className="font-bold text-foreground">
																			{fPercent(question.accuracy)}
																		</span>
																	</div>
																</div>
																<div className="text-[10px] text-muted-foreground select-none pt-1">
																	{m.lesson_details_last_answered()}:{" "}
																	<span className="text-foreground font-medium">
																		{question.lastAnsweredAt
																			? fDateTime(question.lastAnsweredAt)
																			: m.lesson_details_not_answered()}
																	</span>
																</div>
															</div>
														))}
														{data.quiz.questions.length === 0 && (
															<div className="py-8 text-center text-muted-foreground text-sm border border-dashed rounded-lg bg-muted/5 select-none">
																{m.lesson_details_no_quiz_questions()}
															</div>
														)}
													</div>
												</CardContent>
											</Card>
										</div>
									</div>
								)}
							</div>
						)}

						{/* Progress Accordion Section */}
						<div className="border border-muted rounded-xl overflow-hidden shadow-sm bg-card">
							<button
								type="button"
								onClick={() => toggleAccordion("progress")}
								className="w-full p-4 flex items-center justify-between font-bold text-base bg-muted/10 hover:bg-muted/20 border-b transition-colors select-none text-left"
							>
								<div className="flex items-center gap-2">
									<BarChart3 className="h-5 w-5 text-primary" />
									<span>{m.lesson_details_progress_tab()}</span>
								</div>
								<ChevronDown
									className={cn(
										"h-4 w-4 text-muted-foreground transition-transform duration-200",
										activeAccordion === "progress" && "rotate-180",
									)}
								/>
							</button>
							{activeAccordion === "progress" && (
								<div className="p-4 md:p-6 animate-fadeIn space-y-4">
									<div className="grid gap-4 lg:grid-cols-[360px_1fr]">
										<Card>
											<CardHeader>
												<CardTitle>{m.lesson_details_completion()}</CardTitle>
												<CardDescription>
													{m.lesson_details_progress_summary_desc()}
												</CardDescription>
											</CardHeader>
											<CardContent className="space-y-5">
												<div className="space-y-2">
													<div className="flex justify-between text-sm">
														<span className="font-medium">
															{m.lesson_details_completion_rate()}
														</span>
														<span className="text-muted-foreground">
															{fPercent(completionRate)}
														</span>
													</div>
													<Progress value={completionRate} />
												</div>
												<div className="grid grid-cols-2 gap-3 text-sm">
													<div className="rounded-md bg-muted/50 p-3">
														<p className="text-muted-foreground">
															{m.lesson_details_started()}
														</p>
														<p className="text-2xl font-black">
															{fNumber(data.progress.startedCount)}
														</p>
													</div>
													<div className="rounded-md bg-muted/50 p-3">
														<p className="text-muted-foreground">
															{m.lesson_details_completed()}
														</p>
														<p className="text-2xl font-black">
															{fNumber(data.progress.completedCount)}
														</p>
													</div>
												</div>
												<div className="flex items-center gap-2 text-xs text-muted-foreground">
													<Clock className="h-4 w-4" />
													<span>
														{m.lesson_details_active_time({
															minutes: fNumber(
																Math.round(data.engagement.activeSeconds / 60),
															),
														})}
													</span>
												</div>
											</CardContent>
										</Card>

										<Card>
											<CardHeader>
												<CardTitle>
													{m.lesson_details_daily_progress()}
												</CardTitle>
												<CardDescription>
													{m.lesson_details_daily_progress_desc()}
												</CardDescription>
											</CardHeader>
											<CardContent className="p-2 sm:p-6">
												{/* Desktop View Table */}
												<div className="hidden sm:block">
													<Table>
														<TableHeader>
															<TableRow>
																<TableHead>{m.lesson_details_day()}</TableHead>
																<TableHead>
																	{m.lesson_details_started()}
																</TableHead>
																<TableHead>
																	{m.lesson_details_completed()}
																</TableHead>
																<TableHead>
																	{m.lesson_details_completion_rate()}
																</TableHead>
															</TableRow>
														</TableHeader>
														<TableBody>
															{data.progress.byDay.map((day) => {
																const rate =
																	day.startedCount > 0
																		? (day.completedCount / day.startedCount) *
																			100
																		: 0;

																return (
																	<TableRow key={day.dayUtc}>
																		<TableCell>{fDate(day.dayUtc)}</TableCell>
																		<TableCell>
																			{fNumber(day.startedCount)}
																		</TableCell>
																		<TableCell>
																			{fNumber(day.completedCount)}
																		</TableCell>
																		<TableCell>{fPercent(rate)}</TableCell>
																	</TableRow>
																);
															})}
															{data.progress.byDay.length === 0 && (
																<TableRow>
																	<TableCell
																		colSpan={4}
																		className="py-8 text-center text-muted-foreground"
																	>
																		{m.lesson_details_no_progress()}
																	</TableCell>
																</TableRow>
															)}
														</TableBody>
													</Table>
												</div>

												{/* Mobile View Cards */}
												<div className="block sm:hidden space-y-3">
													{data.progress.byDay.map((day) => {
														const rate =
															day.startedCount > 0
																? (day.completedCount / day.startedCount) * 100
																: 0;

														return (
															<div
																key={day.dayUtc}
																className="rounded-xl border bg-muted/10 p-3.5 space-y-2 text-xs"
															>
																<div className="flex justify-between items-center border-b pb-2 select-none font-bold">
																	<span>{fDate(day.dayUtc)}</span>
																	<Badge
																		variant="outline"
																		className="bg-primary/5 text-primary border-primary/20 text-[10px]"
																	>
																		{fPercent(rate)}{" "}
																		{m.lesson_details_completion_rate()}
																	</Badge>
																</div>
																<div className="grid grid-cols-2 gap-2 text-muted-foreground select-none">
																	<div>
																		{m.lesson_details_started()}:{" "}
																		<span className="font-bold text-foreground">
																			{fNumber(day.startedCount)}
																		</span>
																	</div>
																	<div>
																		{m.lesson_details_completed()}:{" "}
																		<span className="font-bold text-foreground">
																			{fNumber(day.completedCount)}
																		</span>
																	</div>
																</div>
															</div>
														);
													})}
													{data.progress.byDay.length === 0 && (
														<div className="py-8 text-center text-muted-foreground text-sm border border-dashed rounded-lg bg-muted/5 select-none">
															{m.lesson_details_no_progress()}
														</div>
													)}
												</div>
											</CardContent>
										</Card>
									</div>
								</div>
							)}
						</div>
					</div>
				</>
			) : null}
		</div>
	);
}
