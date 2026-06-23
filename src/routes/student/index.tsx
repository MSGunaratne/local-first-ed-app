import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
	createFileRoute,
	useNavigate,
	useSearch,
} from "@tanstack/react-router";
import { BookOpen, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StudentLessonCard } from "@/features/lessons/components/student-lesson-card";
import { lessonQueries } from "@/features/lessons/lessons.queries";
import {
	SORT_MAP,
	SORT_OPTIONS,
	studentSearchSchema,
} from "@/features/lessons/student-search";
import { m } from "@/paraglide/messages";
import type { Subject } from "@/types/lesson";
import { SUBJECT_METADATA } from "@/types/lesson";

// ----------------------------------------------------------------------

export const Route = createFileRoute("/student/")({
	validateSearch: (search) => studentSearchSchema.parse(search),
	component: StudentDashboard,
});

function StudentDashboard() {
	const search = useSearch({ from: Route.fullPath });
	const navigate = useNavigate({ from: Route.fullPath });

	const currentSort = search.sort || "newest";
	const sorting = [SORT_MAP[currentSort]];

	const columnFilters = [
		...(search.subject ? [{ id: "subject", value: search.subject }] : []),
		{ id: "isPublished", value: 1 },
	];

	const lessonListQuery = lessonQueries.list({
		pagination: { pageIndex: (search.page || 1) - 1, pageSize: 12 },
		sorting,
		columnFilters,
		globalFilter: search.q || "",
	});

	const { data, isError, isFetching, isPending } = useQuery({
		...lessonListQuery,
		placeholderData: keepPreviousData,
	});

	const lessons = data?.data ?? [];
	const meta = data?.meta;
	const showOfflineHint = isError && lessons.length === 0;

	const handleSearch = (value: string) => {
		navigate({
			search: (prev) => ({ ...prev, q: value || undefined, page: 1 }),
		});
	};

	const handleSortValChange = (value: string) => {
		navigate({
			search: (prev) => ({
				...prev,
				sort: value as keyof typeof SORT_MAP,
			}),
		});
	};

	const handleSubjectChange = (value: string) => {
		navigate({
			search: (prev) => ({
				...prev,
				subject: value === "all" ? undefined : (value as Subject),
				page: 1,
			}),
		});
	};

	const handlePageChange = (newPage: number) => {
		navigate({
			search: (prev) => ({ ...prev, page: newPage }),
		});
	};

	return (
		<div className="space-y-8">
			<div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
				<div className="space-y-2">
					<h1 className="text-3xl font-bold tracking-tight">
						{m.student_dashboard_title()}
					</h1>
					<p className="text-muted-foreground">
						{m.student_dashboard_description()}
					</p>
				</div>

				<div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
					<div className="relative w-full sm:w-64">
						<Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
						<Input
							type="search"
							placeholder={m.student_search_placeholder()}
							className="pl-9"
							defaultValue={search.q}
							onChange={(e) => handleSearch(e.target.value)}
						/>
					</div>
					<Select value={currentSort} onValueChange={handleSortValChange}>
						<SelectTrigger className="w-full sm:w-40">
							<SelectValue placeholder={m.student_sort_by()} />
						</SelectTrigger>
						<SelectContent>
							{SORT_OPTIONS.map((option) => (
								<SelectItem key={option.value} value={option.value}>
									{option.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
			</div>

			<Tabs
				value={search.subject || "all"}
				onValueChange={handleSubjectChange}
				className="w-full"
			>
				<TabsList className="w-full grid grid-cols-4">
					<TabsTrigger value="all">{m.student_all_subjects()}</TabsTrigger>
					{Object.entries(SUBJECT_METADATA).map(([key, meta]) => (
						<TabsTrigger key={key} value={key}>
							{meta.label}
						</TabsTrigger>
					))}
				</TabsList>
			</Tabs>

			{showOfflineHint && (
				<div className="rounded-lg border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
					{m.student_offline_no_cache()}
				</div>
			)}

			{isPending && !data ? (
				<div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
					{["sk-1", "sk-2", "sk-3", "sk-4", "sk-5", "sk-6"].map((sk) => (
						<div
							key={sk}
							className="rounded-xl border border-transparent bg-card/50 p-6 space-y-4 shadow-sm"
						>
							<div className="flex justify-between items-start">
								<Skeleton className="h-5 w-20" />
								<Skeleton className="h-9 w-9 rounded-full" />
							</div>
							<div className="space-y-2">
								<Skeleton className="h-6 w-3/4" />
								<Skeleton className="h-4 w-16" />
							</div>
							<div className="space-y-2 pt-2">
								<Skeleton className="h-4 w-full" />
								<Skeleton className="h-4 w-5/6" />
							</div>
							<div className="flex justify-between items-center pt-4">
								<div className="flex gap-3">
									<Skeleton className="h-4 w-16" />
									<Skeleton className="h-4 w-20" />
								</div>
								<Skeleton className="h-9 w-16" />
							</div>
						</div>
					))}
				</div>
			) : lessons.length === 0 ? (
				<div className="flex flex-col items-center justify-center p-16 text-center rounded-xl border border-dashed bg-muted/20">
					<div className="h-16 w-16 bg-muted rounded-full flex items-center justify-center mb-4">
						<BookOpen className="h-8 w-8 text-muted-foreground/50" />
					</div>
					<h3 className="text-xl font-semibold text-foreground">
						{m.student_no_lessons_found()}
					</h3>
					<p className="text-muted-foreground mt-2 max-w-sm">
						{m.student_no_lessons_desc()}
					</p>
					{(search.q || search.subject) && (
						<Button
							variant="outline"
							onClick={() => navigate({ search: { page: 1, sort: "newest" } })}
							className="mt-6"
						>
							{m.student_clear_filters()}
						</Button>
					)}
				</div>
			) : (
				<div
					className={`grid gap-6 sm:grid-cols-2 lg:grid-cols-3 transition-opacity duration-200 ${
						isFetching ? "opacity-60 pointer-events-none" : "opacity-100"
					}`}
				>
					{lessons.map((lesson) => (
						<StudentLessonCard key={lesson.id} lesson={lesson} />
					))}
				</div>
			)}

			{/* Pagination Controls */}
			{meta && meta.pageCount > 1 && (
				<div className="flex items-center justify-between border-t pt-4">
					<div className="text-sm text-muted-foreground">
						{m.student_pagination_page({
							page: meta.page,
							pageCount: meta.pageCount,
						})}
					</div>
					<div className="flex items-center gap-2">
						<Button
							variant="outline"
							size="sm"
							onClick={() => handlePageChange((search.page || 1) - 1)}
							disabled={!meta.hasPreviousPage}
						>
							{m.student_pagination_prev()}
						</Button>
						<Button
							variant="outline"
							size="sm"
							onClick={() => handlePageChange((search.page || 1) + 1)}
							disabled={!meta.hasNextPage}
						>
							{m.student_pagination_next()}
						</Button>
					</div>
				</div>
			)}
		</div>
	);
}
