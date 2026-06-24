import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
	BookOpen,
	CheckCircle2,
	GraduationCap,
	LayoutDashboard,
	Plus,
	Users,
} from "lucide-react";
import { z } from "zod";
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
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";
import { Subject } from "@/types/lesson";
import { asRole } from "@/types/user";
import { fNumber } from "@/utils/format-number";

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
	const { data, isLoading } = useQuery(analyticsQueries.overview(7));
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

function TeacherDashboardView() {
	return (
		<div className="space-y-4 p-1">
			<div className="flex items-center justify-between">
				<h1 className="text-4xl font-extrabold tracking-tight">
					{m.dashboard_title()}
				</h1>
				<Link to="/lessons/create">
					<Button className="h-12 px-6 text-base font-bold gap-2 shadow-md">
						<Plus className="h-5 w-5" />
						{m.nav_lessons_create()}
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
							{m.dashboard_total_students()}
						</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="text-4xl font-black">0</div>
						<p className="text-sm font-medium text-success-foreground mt-1">
							{m.dashboard_stat_increase({ percent: "0" })}
						</p>
					</CardContent>
				</Card>
				<Card className="border-2 shadow-sm relative overflow-hidden group hover:shadow-md transition-shadow">
					<div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
						<BookOpen className="h-12 w-12" />
					</div>
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-base font-bold text-muted-foreground uppercase tracking-wider">
							{m.dashboard_active_courses()}
						</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="text-4xl font-black">0</div>
						<p className="text-sm font-medium text-success-foreground mt-1">
							{m.dashboard_stat_increase({ percent: "0" })}
						</p>
					</CardContent>
				</Card>
				<Card className="border-2 shadow-sm relative overflow-hidden group hover:shadow-md transition-shadow bg-primary text-primary-foreground">
					<div className="absolute top-0 right-0 p-4 opacity-20">
						<GraduationCap className="h-12 w-12" />
					</div>
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-base font-bold uppercase tracking-wider text-primary-foreground/80">
							{m.nav_lessons()}
						</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="text-4xl font-black">0</div>
						<p className="text-sm font-medium text-primary-foreground/70 mt-1">
							{m.dashboard_lessons_published()}
						</p>
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
							{m.dashboard_welcome_title()}
						</CardTitle>
						<CardDescription className="text-lg mt-2 leading-relaxed">
							{m.dashboard_welcome_description()}
						</CardDescription>
					</CardHeader>
					<CardContent className="pt-4 flex flex-wrap gap-4">
						<Link to="/lessons/create">
							<Button
								variant="default"
								className="h-12 px-6 text-base font-bold"
							>
								{m.lessons_add_button()}
							</Button>
						</Link>
						<Link to="/lessons">
							<Button
								variant="outline"
								className="h-12 px-6 text-base font-semibold"
							>
								{m.dashboard_view_all_lessons()}
							</Button>
						</Link>
					</CardContent>
				</Card>

				<Card className="border-2 shadow-sm border-dashed">
					<CardHeader>
						<CardTitle className="text-xl font-bold">
							{m.dashboard_getting_started()}
						</CardTitle>
						<CardDescription>
							{m.dashboard_getting_started_description()}
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-4">
						<div className="flex items-start gap-4 p-3 rounded-lg bg-muted/50">
							<div className="h-8 w-8 rounded-full bg-accent flex items-center justify-center text-accent-foreground font-bold shrink-0">
								1
							</div>
							<div>
								<p className="font-bold">{m.dashboard_register_students()}</p>
								<p className="text-sm text-muted-foreground">
									{m.dashboard_register_students_description()}
								</p>
							</div>
						</div>
						<div className="flex items-start gap-4 p-3 rounded-lg bg-muted/50">
							<div className="h-8 w-8 rounded-full bg-accent flex items-center justify-center text-accent-foreground font-bold shrink-0">
								2
							</div>
							<div>
								<p className="font-bold">{m.dashboard_create_first_lesson()}</p>
								<p className="text-sm text-muted-foreground">
									{m.dashboard_create_first_lesson_description()}
								</p>
							</div>
						</div>
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
