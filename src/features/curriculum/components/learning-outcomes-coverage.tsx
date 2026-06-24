import { useQuery } from "@tanstack/react-query";
import {
	AlertTriangle,
	BookOpenCheck,
	ExternalLink,
	Filter,
	Search,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { curriculumQueries } from "@/features/curriculum/curriculum.queries";
import type { CurriculumCoverageLessonLink } from "@/features/curriculum/curriculum.service";
import type { CurriculumItem } from "@/features/lessons/lesson.types";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";
import { Subject } from "@/types/lesson";
import { fNumber } from "@/utils/format-number";

type CoverageStatus = "all" | "covered" | "draft" | "uncovered";

interface OutcomeCoverage {
	item: CurriculumItem;
	publishedLessons: CurriculumCoverageLessonLink[];
	draftLessons: CurriculumCoverageLessonLink[];
	status: Exclude<CoverageStatus, "all">;
}

interface CoverageGroup {
	subject: Subject;
	grade: number;
	total: number;
	covered: number;
	draftOnly: number;
	uncovered: number;
	percent: number;
}

const CURRICULUM_SUBJECT_TO_ENUM: Record<string, Subject> = {
	mathematics: Subject.MATH,
	math: Subject.MATH,
	english: Subject.ENGLISH,
	ict: Subject.ICT,
};

function toSubject(value: string): Subject {
	return CURRICULUM_SUBJECT_TO_ENUM[value.toLowerCase()] ?? Subject.ENGLISH;
}

function getPercent(covered: number, total: number) {
	if (total === 0) return 0;
	return Math.round((covered / total) * 100);
}

function getSubjectLabel(subject: Subject) {
	if (subject === Subject.MATH) return m.dashboard_subject_math();
	if (subject === Subject.ENGLISH) return m.dashboard_subject_english();
	return m.dashboard_subject_ict();
}

function buildCoverage(
	curriculumItems: CurriculumItem[],
	lessonLinks: CurriculumCoverageLessonLink[],
) {
	const coverageById = new Map<
		string,
		{
			publishedLessons: CurriculumCoverageLessonLink[];
			draftLessons: CurriculumCoverageLessonLink[];
		}
	>();

	for (const lesson of lessonLinks) {
		for (const curriculumId of lesson.linkedCurriculumIds) {
			const existing = coverageById.get(curriculumId) ?? {
				publishedLessons: [],
				draftLessons: [],
			};

			if (lesson.isPublished) {
				existing.publishedLessons.push(lesson);
			} else {
				existing.draftLessons.push(lesson);
			}

			coverageById.set(curriculumId, existing);
		}
	}

	const outcomes: OutcomeCoverage[] = curriculumItems.map((item) => {
		const coverage = coverageById.get(item.id) ?? {
			publishedLessons: [],
			draftLessons: [],
		};
		const status =
			coverage.publishedLessons.length > 0
				? "covered"
				: coverage.draftLessons.length > 0
					? "draft"
					: "uncovered";

		return {
			item,
			status,
			...coverage,
		};
	});

	const groupMap = new Map<string, CoverageGroup>();
	for (const outcome of outcomes) {
		const subject = toSubject(outcome.item.subject);
		const key = `${subject}:${outcome.item.grade}`;
		const group = groupMap.get(key) ?? {
			subject,
			grade: outcome.item.grade,
			total: 0,
			covered: 0,
			draftOnly: 0,
			uncovered: 0,
			percent: 0,
		};

		group.total += 1;
		if (outcome.status === "covered") {
			group.covered += 1;
		} else if (outcome.status === "draft") {
			group.draftOnly += 1;
		} else {
			group.uncovered += 1;
		}

		group.percent = getPercent(group.covered, group.total);
		groupMap.set(key, group);
	}

	const groups = Array.from(groupMap.values()).sort((a, b) => {
		if (a.subject !== b.subject) return a.subject.localeCompare(b.subject);
		return a.grade - b.grade;
	});
	const total = outcomes.length;
	const covered = outcomes.filter(
		(outcome) => outcome.status === "covered",
	).length;
	const draftOnly = outcomes.filter(
		(outcome) => outcome.status === "draft",
	).length;
	const uncovered = total - covered - draftOnly;

	return {
		outcomes,
		groups,
		total,
		covered,
		draftOnly,
		uncovered,
		percent: getPercent(covered, total),
	};
}

function CoverageSkeleton() {
	return (
		<Card className="border-2 shadow-sm">
			<CardHeader>
				<Skeleton className="h-6 w-64 rounded-md" />
				<Skeleton className="h-4 w-80 rounded-md" />
			</CardHeader>
			<CardContent className="space-y-4">
				<div className="grid gap-3 sm:grid-cols-4">
					{[0, 1, 2, 3].map((item) => (
						<Skeleton key={item} className="h-20 rounded-lg" />
					))}
				</div>
				<Skeleton className="h-48 rounded-lg" />
			</CardContent>
		</Card>
	);
}

function MetricTile({
	label,
	value,
	detail,
	tone = "default",
}: {
	label: string;
	value: string;
	detail: string;
	tone?: "default" | "primary" | "warning";
}) {
	return (
		<div
			className={cn(
				"rounded-lg border bg-muted/20 p-3",
				tone === "primary" && "border-primary/30 bg-primary/5",
				tone === "warning" && "border-amber-500/30 bg-amber-500/10",
			)}
		>
			<p className="text-xs font-semibold uppercase text-muted-foreground">
				{label}
			</p>
			<p className="mt-1 text-2xl font-black">{value}</p>
			<p className="mt-1 text-xs text-muted-foreground">{detail}</p>
		</div>
	);
}

function CoverageCell({ group }: { group: CoverageGroup }) {
	const coverageTone =
		group.percent >= 80
			? "bg-emerald-500"
			: group.percent >= 50
				? "bg-amber-500"
				: "bg-destructive";

	return (
		<div className="rounded-lg border bg-background p-3">
			<div className="flex items-start justify-between gap-3">
				<div>
					<p className="text-sm font-bold">
						{getSubjectLabel(group.subject)}{" "}
						{m.dashboard_grade_short({ grade: String(group.grade) })}
					</p>
					<p className="text-xs text-muted-foreground">
						{m.dashboard_coverage_count({
							covered: fNumber(group.covered),
							total: fNumber(group.total),
						})}
					</p>
				</div>
				<Badge variant="outline" className="font-bold">
					{group.percent}%
				</Badge>
			</div>
			<div className="mt-3 space-y-2">
				<Progress value={group.percent} className="h-2" />
				<div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
					<span>
						{m.dashboard_coverage_uncovered({
							count: fNumber(group.uncovered),
						})}
					</span>
					<span className="text-right">
						{m.dashboard_coverage_draft({ count: fNumber(group.draftOnly) })}
					</span>
				</div>
				<div className={cn("h-1 rounded-full", coverageTone)} />
			</div>
		</div>
	);
}

function OutcomeStatusBadge({
	status,
}: {
	status: Exclude<CoverageStatus, "all">;
}) {
	if (status === "covered") {
		return (
			<Badge className="bg-emerald-600">
				{m.dashboard_coverage_status_covered()}
			</Badge>
		);
	}

	if (status === "draft") {
		return (
			<Badge variant="outline" className="border-amber-500/40 text-amber-700">
				{m.dashboard_coverage_status_draft()}
			</Badge>
		);
	}

	return (
		<Badge variant="destructive">
			{m.dashboard_coverage_status_uncovered()}
		</Badge>
	);
}

export function LearningOutcomesCoverage() {
	const { data, isLoading, isError } = useQuery(curriculumQueries.coverage());
	const [subjectFilter, setSubjectFilter] = useState<Subject | "all">("all");
	const [gradeFilter, setGradeFilter] = useState<string>("all");
	const [statusFilter, setStatusFilter] = useState<CoverageStatus>("uncovered");
	const [searchQuery, setSearchQuery] = useState("");

	const coverage = useMemo(() => {
		if (!data) return null;
		return buildCoverage(data.curriculumItems, data.lessonLinks);
	}, [data]);

	const grades = useMemo(() => {
		if (!coverage) return [];
		return Array.from(
			new Set(coverage.groups.map((group) => group.grade)),
		).sort((a, b) => a - b);
	}, [coverage]);

	const filteredOutcomes = useMemo(() => {
		if (!coverage) return [];
		const query = searchQuery.trim().toLowerCase();

		return coverage.outcomes.filter((outcome) => {
			const subject = toSubject(outcome.item.subject);
			if (subjectFilter !== "all" && subject !== subjectFilter) return false;
			if (gradeFilter !== "all" && outcome.item.grade !== Number(gradeFilter)) {
				return false;
			}
			if (statusFilter !== "all" && outcome.status !== statusFilter) {
				return false;
			}
			if (!query) return true;

			return [
				outcome.item.id,
				outcome.item.topic,
				outcome.item.learning_outcome,
				outcome.item.content_summary,
				outcome.item.competency_level,
				...(outcome.item.keywords ?? []),
			]
				.join(" ")
				.toLowerCase()
				.includes(query);
		});
	}, [coverage, gradeFilter, searchQuery, statusFilter, subjectFilter]);

	if (isLoading) {
		return <CoverageSkeleton />;
	}

	if (isError || !coverage) {
		return (
			<Card className="border-2 border-destructive/30 shadow-sm">
				<CardHeader>
					<CardTitle className="flex items-center gap-2 text-xl font-bold">
						<AlertTriangle className="h-5 w-5 text-destructive" />
						{m.dashboard_coverage_title()}
					</CardTitle>
					<CardDescription>{m.dashboard_coverage_error()}</CardDescription>
				</CardHeader>
			</Card>
		);
	}

	const largestGaps = coverage.groups
		.filter((group) => group.uncovered > 0)
		.sort((a, b) => b.uncovered - a.uncovered)
		.slice(0, 4);
	const lessonCount = data?.lessonLinks.length ?? 0;

	return (
		<Card className="border-2 shadow-sm">
			<CardHeader className="gap-3">
				<div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
					<div>
						<CardTitle className="flex items-center gap-2 text-2xl font-bold">
							<BookOpenCheck className="h-6 w-6 text-primary" />
							{m.dashboard_coverage_title()}
						</CardTitle>
						<CardDescription className="mt-1">
							{m.dashboard_coverage_description()}
						</CardDescription>
					</div>
					<Sheet>
						<SheetTrigger asChild>
							<Button className="gap-2 self-start">
								<ExternalLink className="h-4 w-4" />
								{m.dashboard_coverage_view_gaps()}
							</Button>
						</SheetTrigger>
						<SheetContent className="w-full sm:max-w-2xl">
							<SheetHeader>
								<SheetTitle>{m.dashboard_coverage_gaps_title()}</SheetTitle>
								<SheetDescription>
									{m.dashboard_coverage_gaps_description({
										count: fNumber(filteredOutcomes.length),
									})}
								</SheetDescription>
							</SheetHeader>
							<div className="space-y-3 px-4">
								<div className="grid gap-2 sm:grid-cols-3">
									<Select
										value={subjectFilter}
										onValueChange={(value) =>
											setSubjectFilter(value as Subject | "all")
										}
									>
										<SelectTrigger className="w-full">
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="all">
												{m.dashboard_all_subjects()}
											</SelectItem>
											{Object.values(Subject).map((subject) => (
												<SelectItem key={subject} value={subject}>
													{getSubjectLabel(subject)}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
									<Select value={gradeFilter} onValueChange={setGradeFilter}>
										<SelectTrigger className="w-full">
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="all">
												{m.dashboard_all_grades()}
											</SelectItem>
											{grades.map((grade) => (
												<SelectItem key={grade} value={String(grade)}>
													{m.dashboard_grade_label({ grade: String(grade) })}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
									<Select
										value={statusFilter}
										onValueChange={(value) =>
											setStatusFilter(value as CoverageStatus)
										}
									>
										<SelectTrigger className="w-full">
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="all">
												{m.dashboard_coverage_status_all()}
											</SelectItem>
											<SelectItem value="uncovered">
												{m.dashboard_coverage_status_uncovered()}
											</SelectItem>
											<SelectItem value="draft">
												{m.dashboard_coverage_status_draft()}
											</SelectItem>
											<SelectItem value="covered">
												{m.dashboard_coverage_status_covered()}
											</SelectItem>
										</SelectContent>
									</Select>
								</div>
								<div className="relative">
									<Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
									<Input
										value={searchQuery}
										onChange={(event) => setSearchQuery(event.target.value)}
										placeholder={m.dashboard_coverage_search_placeholder()}
										className="pl-9"
									/>
								</div>
							</div>
							<ScrollArea className="min-h-0 flex-1 px-4 pb-4">
								<div className="space-y-3">
									{filteredOutcomes.map((outcome) => (
										<div
											key={outcome.item.id}
											className="rounded-lg border bg-background p-3"
										>
											<div className="flex flex-wrap items-start justify-between gap-2">
												<div className="min-w-0">
													<div className="flex flex-wrap items-center gap-1.5">
														<Badge variant="outline">{outcome.item.id}</Badge>
														<Badge variant="secondary">
															{m.dashboard_grade_label({
																grade: String(outcome.item.grade),
															})}
														</Badge>
														<OutcomeStatusBadge status={outcome.status} />
													</div>
													<h4 className="mt-2 font-bold leading-snug">
														{outcome.item.topic}
													</h4>
												</div>
											</div>
											<p className="mt-2 text-sm leading-relaxed text-muted-foreground">
												{outcome.item.learning_outcome}
											</p>
											{outcome.publishedLessons.length > 0 && (
												<p className="mt-2 text-xs text-muted-foreground">
													{m.dashboard_coverage_lessons_linked({
														count: fNumber(outcome.publishedLessons.length),
													})}
												</p>
											)}
											{outcome.status === "draft" && (
												<p className="mt-2 text-xs text-amber-700">
													{m.dashboard_coverage_draft_lessons({
														count: fNumber(outcome.draftLessons.length),
													})}
												</p>
											)}
										</div>
									))}
									{filteredOutcomes.length === 0 && (
										<div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
											{m.dashboard_coverage_no_outcomes()}
										</div>
									)}
								</div>
							</ScrollArea>
						</SheetContent>
					</Sheet>
				</div>
			</CardHeader>
			<CardContent className="space-y-5">
				<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
					<MetricTile
						label={m.dashboard_coverage_percent()}
						value={`${coverage.percent}%`}
						detail={m.dashboard_coverage_count({
							covered: fNumber(coverage.covered),
							total: fNumber(coverage.total),
						})}
						tone="primary"
					/>
					<MetricTile
						label={m.dashboard_coverage_uncovered_label()}
						value={fNumber(coverage.uncovered)}
						detail={m.dashboard_coverage_uncovered_detail()}
						tone={coverage.uncovered > 0 ? "warning" : "default"}
					/>
					<MetricTile
						label={m.dashboard_coverage_draft_label()}
						value={fNumber(coverage.draftOnly)}
						detail={m.dashboard_coverage_draft_detail()}
					/>
					<MetricTile
						label={m.dashboard_coverage_lessons_label()}
						value={fNumber(lessonCount)}
						detail={m.dashboard_coverage_lessons_detail()}
					/>
				</div>

				<div className="grid gap-5 xl:grid-cols-[1fr_280px]">
					<div className="space-y-3">
						<div className="flex items-center gap-2 text-sm font-bold">
							<Filter className="h-4 w-4 text-muted-foreground" />
							{m.dashboard_coverage_by_grade()}
						</div>
						<div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
							{coverage.groups.map((group) => (
								<CoverageCell
									key={`${group.subject}-${group.grade}`}
									group={group}
								/>
							))}
						</div>
					</div>

					<div className="space-y-3 rounded-lg border bg-muted/20 p-3">
						<h3 className="text-sm font-bold">
							{m.dashboard_coverage_largest_gaps()}
						</h3>
						{largestGaps.length > 0 ? (
							largestGaps.map((group) => (
								<div
									key={`gap-${group.subject}-${group.grade}`}
									className="rounded-md bg-background p-3"
								>
									<div className="flex items-center justify-between gap-2">
										<p className="text-sm font-semibold">
											{getSubjectLabel(group.subject)}{" "}
											{m.dashboard_grade_short({
												grade: String(group.grade),
											})}
										</p>
										<Badge variant="destructive">
											{fNumber(group.uncovered)}
										</Badge>
									</div>
									<Progress value={group.percent} className="mt-3 h-2" />
									<p className="mt-2 text-xs text-muted-foreground">
										{m.dashboard_coverage_count({
											covered: fNumber(group.covered),
											total: fNumber(group.total),
										})}
									</p>
								</div>
							))
						) : (
							<p className="rounded-md bg-background p-3 text-sm text-muted-foreground">
								{m.dashboard_coverage_no_gaps()}
							</p>
						)}
					</div>
				</div>
			</CardContent>
		</Card>
	);
}
