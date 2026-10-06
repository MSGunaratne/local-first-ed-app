import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
	BookOpen,
	CheckCircle2,
	Clock3,
	Eye,
	FileText,
	GraduationCap,
	LayoutDashboard,
	Pencil,
	Plus,
	Users,
} from "lucide-react";
import { useEffect, useState } from "react";
import { z } from "zod";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { analyticsQueries } from "@/features/analytics/analytics.queries";
import { LessonFeedbackInsights } from "@/features/analytics/components/lesson-feedback-insights";
import { LearningOutcomesCoverage } from "@/features/curriculum/components/learning-outcomes-coverage";
import { lessonQueries } from "@/features/lessons/lessons.queries";
import type { LessonListItem } from "@/features/lessons/lessons.service";
import type { DataTableQueryParams } from "@/lib/dataTableSearchSchema";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";
import { Subject } from "@/types/lesson";
import { asRole } from "@/types/user";
import { fNumber } from "@/utils/format-number";
import { fDate } from "@/utils/format-time";

const dashboardSearchSchema = z.object({
	feedbackSubject: z
		.enum([Subject.MATH, Subject.ENGLISH, Subject.ICT])
		.optional()
		.catch(undefined),
	feedbackGrade: z.coerce
		.number()
		.int()
		.min(6)
		.max(12)
		.optional()
		.catch(undefined),
});

function useHasHydrated() {
	const [hasHydrated, setHasHydrated] = useState(false);

	useEffect(() => {
		setHasHydrated(true);
	}, []);

	return hasHydrated;
}

function KpiValueSkeleton({
	className,
	captionWidth = "w-28",
}: {
	className?: string;
	captionWidth?: string;
}) {
	return (
		<div className="space-y-2">
			<Skeleton className={cn("h-10 w-24 rounded-md", className)} />
			<Skeleton className={cn("h-4 rounded-md", captionWidth, className)} />
		</div>
	);
}

function RouteRowSkeleton({ index }: { index: number }) {
	const widths = ["w-7/12", "w-5/12", "w-2/3", "w-1/2", "w-3/5"];

	return (
		<div className="flex items-center justify-between gap-4 rounded-lg bg-muted/40 px-3 py-2">
			<div className="flex min-w-0 flex-1 items-center gap-3">
				<Skeleton className="h-6 w-6 rounded-full" />
				<Skeleton
					className={cn("h-4 rounded-md", widths[index % widths.length])}
				/>
			</div>
			<Skeleton className="h-4 w-16 rounded-md" />
		</div>
	);
}

function RouteListSkeleton() {
	return (
		<div className="space-y-3">
			{[0, 1, 2, 3, 4].map((index) => (
				<RouteRowSkeleton key={`route-skeleton-${index}`} index={index} />
			))}
		</div>
	);
}

export const Route = createFileRoute("/_dashboard/dashboard")({
	validateSearch: dashboardSearchSchema,
	component: DashboardIndex,
});

function DashboardIndex() {
	const { session } = Route.useRouteContext();
	const adminRole = asRole(session?.user?.role, "admin");

	if (adminRole) {
		return <AdminDashboardView />;
	}

	return <TeacherDashboardView />;
}

function AdminDashboardView() {
	const search = Route.useSearch();
	const navigate = useNavigate({ from: Route.fullPath });
	const query = useQuery(analyticsQueries.overview(7));
	const hasHydrated = useHasHydrated();
	const { data } = query;
	const isLoading = !hasHydrated || query.isLoading;
	const kpis = data?.kpis;

	const subjectFilter = search.feedbackSubject ?? "all";
	const gradeFilter = search.feedbackGrade
		? String(search.feedbackGrade)
		: "all";

	return (
		<div className="space-y-4 p-1">
			<div className="flex items-center justify-between">
				<h1 className="text-4xl font-extrabold tracking-tight">
					{m.dashboard_admin_title()}
				</h1>
				<Link to="/users">
					<Button className="h-12 px-6 text-base font-bold gap-2 shadow-md">
						<Users className="h-5 w-5" />
						{m.dashboard_manage_users()}
					</Button>
				</Link>
			</div>

			<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
				<Card className="border-2 shadow-sm relative overflow-hidden group hover:shadow-md transition-shadow">
					<div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
						<Users className="h-12 w-12" />
					</div>
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-base font-bold text-muted-foreground uppercase tracking-wider">
							{m.dashboard_daily_active_users()}
						</CardTitle>
					</CardHeader>
					<CardContent>
						{isLoading ? (
							<KpiValueSkeleton />
						) : (
							<>
								<div className="text-4xl font-black">
									{fNumber(kpis?.dau ?? 0)}
								</div>
								<p className="text-sm font-medium text-muted-foreground mt-1">
									{m.dashboard_last_7_days()}
								</p>
							</>
						)}
					</CardContent>
				</Card>
				<Card className="border-2 shadow-sm relative overflow-hidden group hover:shadow-md transition-shadow">
					<div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
						<BookOpen className="h-12 w-12" />
					</div>
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-base font-bold text-muted-foreground uppercase tracking-wider">
							{m.dashboard_sessions()}
						</CardTitle>
					</CardHeader>
					<CardContent>
						{isLoading ? (
							<KpiValueSkeleton captionWidth="w-36" />
						) : (
							<>
								<div className="text-4xl font-black">
									{fNumber(kpis?.sessions ?? 0)}
								</div>
								<p className="text-sm font-medium text-muted-foreground mt-1">
									{m.dashboard_avg_duration({
										seconds: fNumber(kpis?.avgSessionDurationSeconds ?? 0),
									})}
								</p>
							</>
						)}
					</CardContent>
				</Card>
				<Card className="border-2 shadow-sm relative overflow-hidden group hover:shadow-md transition-shadow bg-primary text-primary-foreground">
					<div className="absolute top-0 right-0 p-4 opacity-20">
						<GraduationCap className="h-12 w-12" />
					</div>
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-base font-bold uppercase tracking-wider text-primary-foreground/80">
							{m.dashboard_page_views_session()}
						</CardTitle>
					</CardHeader>
					<CardContent>
						{isLoading ? (
							<KpiValueSkeleton
								className="bg-primary-foreground/20"
								captionWidth="w-40"
							/>
						) : (
							<>
								<div className="text-4xl font-black">
									{fNumber(kpis?.pageViewsPerSession ?? 0, {
										maximumFractionDigits: 2,
									})}
								</div>
								<p className="text-sm font-medium text-primary-foreground/70 mt-1">
									{m.dashboard_total_page_views({
										count: fNumber(kpis?.pageViews ?? 0),
									})}
								</p>
							</>
						)}
					</CardContent>
				</Card>
				<Card className="border-2 shadow-sm relative overflow-hidden group hover:shadow-md transition-shadow">
					<div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
						<CheckCircle2 className="h-12 w-12" />
					</div>
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-base font-bold text-muted-foreground uppercase tracking-wider">
							{m.dashboard_lesson_feedback()}
						</CardTitle>
					</CardHeader>
					<CardContent>
						{isLoading ? (
							<KpiValueSkeleton captionWidth="w-24" />
						) : (
							<>
								<div className="text-4xl font-black">
									{fNumber(kpis?.avgLessonRating ?? 0, {
										minimumFractionDigits: 1,
										maximumFractionDigits: 2,
									})}
								</div>
								<p className="text-sm font-medium text-muted-foreground mt-1">
									{m.dashboard_ratings({
										count: fNumber(kpis?.feedbackCount ?? 0),
									})}
								</p>
							</>
						)}
					</CardContent>
				</Card>
			</div>

			<div className="grid gap-6 md:grid-cols-2">
				<Card className="border-2 border-primary/20 shadow-lg bg-gradient-to-br from-primary/5 to-background">
					<CardHeader className="pb-4">
						<CardTitle className="text-2xl font-bold flex items-center gap-3">
							<div className="h-10 w-10 rounded-full bg-primary flex items-center justify-center text-primary-foreground shadow-inner">
								<LayoutDashboard className="h-5 w-5" />
							</div>
							{m.dashboard_most_visited_routes()}
						</CardTitle>
					</CardHeader>
					<CardContent className="space-y-3">
						{isLoading ? (
							<RouteListSkeleton />
						) : (
							(data?.topRoutes ?? []).slice(0, 5).map((route) => (
								<div
									key={route.routeTemplate}
									className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2"
								>
									<p className="font-medium">{route.routeTemplate}</p>
									<p className="text-sm text-muted-foreground">
										{fNumber(route.views)} views
									</p>
								</div>
							))
						)}
					</CardContent>
				</Card>

				<Card className="border-2 shadow-sm border-dashed">
					<CardHeader>
						<CardTitle className="text-xl font-bold">
							{m.dashboard_drop_off_routes()}
						</CardTitle>
						<CardDescription>
							{m.dashboard_drop_off_routes_description()}
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-3">
						{isLoading ? (
							<RouteListSkeleton />
						) : (
							(data?.dropOffRoutes ?? []).slice(0, 5).map((route) => (
								<div
									key={route.routeTemplate}
									className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2"
								>
									<p className="font-medium">{route.routeTemplate}</p>
									<p className="text-sm text-muted-foreground">
										{fNumber(route.exits)} exits
									</p>
								</div>
							))
						)}
					</CardContent>
				</Card>
			</div>

			<LearningOutcomesCoverage />

			<LessonFeedbackInsights
				feedbackInsights={data?.feedbackInsights}
				isLoading={isLoading}
				subjectFilter={subjectFilter}
				gradeFilter={gradeFilter}
				onSubjectFilterChange={(value) => {
					navigate({
						replace: true,
						search: (prev) => ({
							...prev,
							feedbackSubject: value === "all" ? undefined : value,
						}),
					});
				}}
				onGradeFilterChange={(value) => {
					navigate({
						replace: true,
						search: (prev) => ({
							...prev,
							feedbackGrade: value === "all" ? undefined : Number(value),
						}),
					});
				}}
			/>
		</div>
	);
}

function TeacherStatCard({
	title,
	value,
	description,
	icon: Icon,
	highlight = false,
	isLoading,
}: {
	title: string;
	value: number;
	description: string;
	icon: typeof BookOpen;
	highlight?: boolean;
	isLoading: boolean;
}) {
	return (
		<Card
			className={cn(
				"border-2 shadow-sm relative overflow-hidden transition-shadow hover:shadow-md",
				highlight && "bg-primary text-primary-foreground",
			)}
		>
			<div
				className={cn(
					"absolute top-0 right-0 p-4 opacity-10",
					highlight && "opacity-20",
				)}
			>
				<Icon className="h-12 w-12" />
			</div>
			<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
				<CardTitle
					className={cn(
						"text-base font-bold uppercase tracking-wider text-muted-foreground",
						highlight && "text-primary-foreground/80",
					)}
				>
					{title}
				</CardTitle>
			</CardHeader>
			<CardContent>
				{isLoading ? (
					<KpiValueSkeleton
						className={highlight ? "bg-primary-foreground/20" : undefined}
						captionWidth="w-32"
					/>
				) : (
					<>
						<div className="text-4xl font-black">{fNumber(value)}</div>
						<p
							className={cn(
								"text-sm font-medium text-muted-foreground mt-1",
								highlight && "text-primary-foreground/70",
							)}
						>
							{description}
						</p>
					</>
				)}
			</CardContent>
		</Card>
	);
}

function LessonRowSkeleton({ index }: { index: number }) {
	const widths = ["w-8/12", "w-7/12", "w-9/12", "w-6/12", "w-10/12"];

	return (
		<div className="flex items-center justify-between gap-4 rounded-lg border bg-muted/30 p-3">
			<div className="min-w-0 flex-1 space-y-2">
				<Skeleton
					className={cn("h-5 rounded-md", widths[index % widths.length])}
				/>
				<div className="flex gap-2">
					<Skeleton className="h-5 w-16 rounded-full" />
					<Skeleton className="h-5 w-20 rounded-full" />
					<Skeleton className="h-5 w-24 rounded-full" />
				</div>
			</div>
			<div className="flex gap-2">
				<Skeleton className="h-9 w-9 rounded-md" />
				<Skeleton className="h-9 w-9 rounded-md" />
			</div>
		</div>
	);
}

function RecentLessonRow({ lesson }: { lesson: LessonListItem }) {
	return (
		<div className="flex flex-col gap-3 rounded-lg border bg-muted/20 p-3 sm:flex-row sm:items-center sm:justify-between">
			<div className="min-w-0 space-y-2">
				<div className="flex flex-wrap items-center gap-2">
					<p className="min-w-0 truncate text-base font-bold">{lesson.title}</p>
					<Badge variant={lesson.isPublished ? "default" : "secondary"}>
						{lesson.isPublished
							? m.lesson_details_published()
							: m.lesson_details_draft()}
					</Badge>
				</div>
				<div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
					<span>{lesson.subject}</span>
					<span>{m.lessons_grade({ grade: String(lesson.gradeLevel) })}</span>
					<span className="inline-flex items-center gap-1">
						<Clock3 className="h-3.5 w-3.5" />
						{m.lesson_details_updated({ date: fDate(lesson.updatedAt) })}
					</span>
				</div>
			</div>
			<div className="flex shrink-0 gap-2">
				<Button asChild variant="outline" size="sm" className="gap-2">
					<Link to="/lessons/$lessonId" params={{ lessonId: lesson.id }}>
						<Eye className="h-4 w-4" />
						{m.common_preview()}
					</Link>
				</Button>
				<Button asChild variant="outline" size="sm" className="gap-2">
					<Link to="/lessons/$lessonId/edit" params={{ lessonId: lesson.id }}>
						<Pencil className="h-4 w-4" />
						{m.common_edit()}
					</Link>
				</Button>
			</div>
		</div>
	);
}

function TeacherDashboardView() {
	const { session } = Route.useRouteContext();
	const teacherId = session?.user.id ?? "";
	const teacherLessonParams = {
		pagination: { pageIndex: 0, pageSize: 6 },
		sorting: [{ id: "updatedAt", desc: true }],
		columnFilters: [{ id: "teacherId", value: teacherId }],
		globalFilter: "",
	} satisfies DataTableQueryParams;

	const query = useQuery(lessonQueries.list(teacherLessonParams));
	const hasHydrated = useHasHydrated();
	const { data } = query;
	const isLoading = !hasHydrated || query.isLoading;
	const recentLessons = data?.data ?? [];
	const totalLessons = data?.meta.itemCount ?? 0;
	const publishedLessons = recentLessons.filter(
		(lesson) => lesson.isPublished,
	).length;
	const draftLessons = recentLessons.length - publishedLessons;
	const hasLessons = recentLessons.length > 0;

	return (
		<div className="space-y-4 p-1">
			<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
				<div>
					<h1 className="text-4xl font-extrabold tracking-tight">
						{m.dashboard_title()}
					</h1>
					<p className="mt-1 text-sm text-muted-foreground">
						{m.dashboard_teacher_description()}
					</p>
				</div>
				<Button
					asChild
					className="h-12 px-6 text-base font-bold gap-2 shadow-md"
				>
					<Link to="/lessons/create">
						<Plus className="h-5 w-5" />
						{m.nav_lessons_create()}
					</Link>
				</Button>
			</div>

			<div className="grid gap-4 md:grid-cols-3">
				<TeacherStatCard
					title={m.dashboard_my_lessons()}
					value={totalLessons}
					description={m.dashboard_my_lessons_description()}
					icon={BookOpen}
					highlight
					isLoading={isLoading}
				/>
				<TeacherStatCard
					title={m.dashboard_published_lessons()}
					value={publishedLessons}
					description={m.dashboard_published_lessons_description()}
					icon={CheckCircle2}
					isLoading={isLoading}
				/>
				<TeacherStatCard
					title={m.dashboard_draft_lessons()}
					value={draftLessons}
					description={m.dashboard_draft_lessons_description()}
					icon={FileText}
					isLoading={isLoading}
				/>
			</div>

			<div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
				<Card className="border-2 shadow-sm">
					<CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
						<div>
							<CardTitle className="text-xl font-bold">
								{m.dashboard_recent_lessons()}
							</CardTitle>
							<CardDescription>
								{m.dashboard_recent_lessons_description()}
							</CardDescription>
						</div>
						<Button asChild variant="outline" size="sm" className="gap-2">
							<Link to="/lessons">
								<BookOpen className="h-4 w-4" />
								{m.dashboard_view_all_lessons()}
							</Link>
						</Button>
					</CardHeader>
					<CardContent>
						{isLoading ? (
							<div className="space-y-3">
								{[0, 1, 2, 3].map((index) => (
									<LessonRowSkeleton
										key={`teacher-lesson-skeleton-${index}`}
										index={index}
									/>
								))}
							</div>
						) : hasLessons ? (
							<div className="space-y-3">
								{recentLessons.map((lesson) => (
									<RecentLessonRow key={lesson.id} lesson={lesson} />
								))}
							</div>
						) : (
							<div className="flex min-h-56 flex-col items-center justify-center rounded-lg border border-dashed bg-muted/20 p-6 text-center">
								<div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground">
									<Plus className="h-6 w-6" />
								</div>
								<h2 className="text-xl font-bold">
									{m.dashboard_no_lessons_title()}
								</h2>
								<p className="mt-2 max-w-md text-sm text-muted-foreground">
									{m.dashboard_no_lessons_description()}
								</p>
								<Button asChild className="mt-5 gap-2">
									<Link to="/lessons/create">
										<Plus className="h-4 w-4" />
										{m.nav_lessons_create()}
									</Link>
								</Button>
							</div>
						)}
					</CardContent>
				</Card>

				<Card className="border-2 shadow-sm">
					<CardHeader>
						<CardTitle className="text-xl font-bold">
							{m.dashboard_quick_actions()}
						</CardTitle>
						<CardDescription>
							{m.dashboard_quick_actions_description()}
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-3">
						<Button
							asChild
							variant="outline"
							className="h-11 w-full justify-start gap-2"
						>
							<Link to="/student">
								<Eye className="h-4 w-4" />
								{m.dashboard_student_preview()}
							</Link>
						</Button>
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
