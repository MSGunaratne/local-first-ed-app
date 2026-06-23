import { MessageSquareText, Star } from "lucide-react";
import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SUBJECT_METADATA, Subject } from "@/types/lesson";
import { fNumber } from "@/utils/format-number";

type FeedbackItem = {
	lessonId: string;
	lessonTitle: string;
	subject: Subject | null;
	gradeLevel: number | null;
	avgRating: number;
	ratingCount: number;
};

type FeedbackComment = {
	lessonId: string;
	lessonTitle: string;
	subject: Subject | null;
	gradeLevel: number | null;
	rating: number;
	comment: string;
	createdAt: Date;
};

type LessonFeedbackInsightsProps = {
	feedbackInsights?: {
		topRatedLessons: FeedbackItem[];
		lowRatedLessons: FeedbackItem[];
		recentComments: FeedbackComment[];
	};
	isLoading: boolean;
	subjectFilter: "all" | Subject;
	gradeFilter: "all" | string;
	onSubjectFilterChange: (value: "all" | Subject) => void;
	onGradeFilterChange: (value: "all" | string) => void;
};

function renderStars(value: number) {
	const rounded = Math.round(value);
	return [1, 2, 3, 4, 5].map((starValue) => (
		<Star
			key={`star-${starValue}-${rounded}`}
			className={
				starValue <= rounded
					? "h-3.5 w-3.5 fill-yellow-400 text-yellow-500"
					: "h-3.5 w-3.5 text-muted-foreground"
			}
		/>
	));
}

function LessonRatingList({
	items,
	emptyLabel,
}: {
	items: FeedbackItem[];
	emptyLabel: string;
}) {
	if (items.length === 0) {
		return <p className="text-sm text-muted-foreground">{emptyLabel}</p>;
	}

	return (
		<div className="space-y-3">
			{items.map((item) => (
				<div
					key={`${item.lessonId}-${item.subject ?? "unknown"}-${item.gradeLevel ?? "na"}`}
					className="rounded-lg border bg-card/70 p-3"
				>
					<div className="flex items-center justify-between gap-3">
						<p className="font-medium leading-snug">{item.lessonTitle}</p>
						<div className="flex items-center gap-2">
							{item.subject && (
								<Badge variant="secondary">
									{SUBJECT_METADATA[item.subject].label}
								</Badge>
							)}
							{item.gradeLevel && (
								<Badge variant="secondary">Grade {item.gradeLevel}</Badge>
							)}
							<Badge variant="outline">
								{fNumber(item.ratingCount)} ratings
							</Badge>
						</div>
					</div>
					<div className="mt-2 flex items-center gap-2">
						<div className="flex items-center gap-0.5">
							{renderStars(item.avgRating)}
						</div>
						<span className="text-sm text-muted-foreground">
							{fNumber(item.avgRating, {
								minimumFractionDigits: 2,
								maximumFractionDigits: 2,
							})}{" "}
							/ 5
						</span>
					</div>
				</div>
			))}
		</div>
	);
}

export function LessonFeedbackInsights({
	feedbackInsights,
	isLoading,
	subjectFilter,
	gradeFilter,
	onSubjectFilterChange,
	onGradeFilterChange,
}: LessonFeedbackInsightsProps) {
	const allItems = useMemo(
		() => [
			...(feedbackInsights?.topRatedLessons ?? []),
			...(feedbackInsights?.lowRatedLessons ?? []),
		],
		[feedbackInsights],
	);

	const gradeOptions = useMemo(() => {
		const grades = allItems
			.map((item) => item.gradeLevel)
			.filter((value): value is number => typeof value === "number");

		return Array.from(new Set(grades)).sort((a, b) => a - b);
	}, [allItems]);

	const matchesFilters = (
		subject: Subject | null,
		gradeLevel: number | null,
	) => {
		const subjectMatches = subjectFilter === "all" || subject === subjectFilter;
		const gradeMatches =
			gradeFilter === "all" || String(gradeLevel ?? "") === gradeFilter;

		return subjectMatches && gradeMatches;
	};

	const filteredTopRatedLessons = (
		feedbackInsights?.topRatedLessons ?? []
	).filter((item) => matchesFilters(item.subject, item.gradeLevel));

	const filteredLowRatedLessons = (
		feedbackInsights?.lowRatedLessons ?? []
	).filter((item) => matchesFilters(item.subject, item.gradeLevel));

	const filteredComments = (feedbackInsights?.recentComments ?? []).filter(
		(item) => matchesFilters(item.subject, item.gradeLevel),
	);

	return (
		<Card className="border-2 border-dashed">
			<CardHeader>
				<CardTitle className="flex items-center gap-2 text-xl font-bold">
					<MessageSquareText className="h-5 w-5" />
					Feedback by Lesson
				</CardTitle>
				<CardDescription>
					A compact insights view works better than a table for qualitative
					lesson feedback.
				</CardDescription>
			</CardHeader>
			<CardContent>
				{isLoading ? (
					<p className="text-sm text-muted-foreground">
						Loading feedback insights...
					</p>
				) : (
					<Tabs defaultValue="top" className="w-full space-y-4">
						<div className="grid gap-3 md:grid-cols-2">
							<Select
								value={subjectFilter}
								onValueChange={(value) =>
									onSubjectFilterChange(value as "all" | Subject)
								}
							>
								<SelectTrigger className="w-full">
									<SelectValue placeholder="Filter by subject" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="all">All subjects</SelectItem>
									<SelectItem value={Subject.MATH}>Math</SelectItem>
									<SelectItem value={Subject.ENGLISH}>English</SelectItem>
									<SelectItem value={Subject.ICT}>ICT</SelectItem>
								</SelectContent>
							</Select>

							<Select value={gradeFilter} onValueChange={onGradeFilterChange}>
								<SelectTrigger className="w-full">
									<SelectValue placeholder="Filter by grade" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="all">All grades</SelectItem>
									{gradeOptions.map((grade) => (
										<SelectItem key={grade} value={String(grade)}>
											Grade {grade}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>

						<TabsList>
							<TabsTrigger value="top">Top Rated</TabsTrigger>
							<TabsTrigger value="improve">Needs Attention</TabsTrigger>
							<TabsTrigger value="comments">Recent Comments</TabsTrigger>
						</TabsList>

						<TabsContent value="top" className="mt-4">
							<LessonRatingList
								items={filteredTopRatedLessons}
								emptyLabel="No lesson ratings in this period yet."
							/>
						</TabsContent>

						<TabsContent value="improve" className="mt-4">
							<LessonRatingList
								items={filteredLowRatedLessons}
								emptyLabel="No low-rated lessons found in this period."
							/>
						</TabsContent>

						<TabsContent value="comments" className="mt-4">
							<ScrollArea className="h-72 pr-3">
								<div className="space-y-3">
									{filteredComments.map((item) => (
										<Collapsible
											key={`${item.lessonId}-${item.createdAt.toISOString()}-${item.comment.slice(0, 16)}`}
											className="rounded-lg border bg-card/70 p-3"
										>
											<CollapsibleTrigger className="w-full text-left">
												<div className="flex items-center justify-between gap-2">
													<div>
														<p className="font-medium">{item.lessonTitle}</p>
														<p className="text-xs text-muted-foreground">
															{item.subject
																? SUBJECT_METADATA[item.subject].label
																: "Unknown subject"}
															{item.gradeLevel
																? ` • Grade ${item.gradeLevel}`
																: ""}
														</p>
													</div>
													<div className="flex items-center gap-1">
														{renderStars(item.rating)}
													</div>
												</div>
											</CollapsibleTrigger>
											<CollapsibleContent className="pt-2">
												<p className="text-sm text-muted-foreground whitespace-pre-wrap">
													{item.comment}
												</p>
											</CollapsibleContent>
										</Collapsible>
									))}
									{filteredComments.length === 0 && (
										<p className="text-sm text-muted-foreground">
											No comments yet in this period.
										</p>
									)}
								</div>
							</ScrollArea>
						</TabsContent>
					</Tabs>
				)}
			</CardContent>
		</Card>
	);
}
