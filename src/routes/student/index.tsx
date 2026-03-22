import { useQuery } from "@tanstack/react-query";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StudentLessonCard } from "@/features/lessons/components/student-lesson-card";
import { lessonQueries } from "@/features/lessons/lessons.queries";
import {
	SORT_MAP,
	SORT_OPTIONS,
	studentSearchSchema,
} from "@/features/lessons/student-search";
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

	const columnFilters = [];
	if (search.subject) {
		columnFilters.push({ id: "subject", value: search.subject });
	}
	columnFilters.push({ id: "isPublished", value: 1 });

	const lessonListQuery = lessonQueries.list({
		pagination: { pageIndex: (search.page || 1) - 1, pageSize: 12 },
		sorting,
		columnFilters,
		globalFilter: search.q || "",
	});

	const { data, isError, isFetching, isPending } = useQuery(lessonListQuery);

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
					<h1 className="text-3xl font-bold tracking-tight">Your Lessons</h1>
					<p className="text-muted-foreground">
						Browse and manage your learning materials.
					</p>
				</div>

				<div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
					<div className="relative w-full sm:w-64">
						<Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
						<Input
							type="search"
							placeholder="Search lessons..."
							className="pl-9"
							defaultValue={search.q}
							onChange={(e) => handleSearch(e.target.value)}
						/>
					</div>
					<Select value={currentSort} onValueChange={handleSortValChange}>
						<SelectTrigger className="w-full sm:w-40">
							<SelectValue placeholder="Sort by" />
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
					<TabsTrigger value="all">All Subjects</TabsTrigger>
					{Object.entries(SUBJECT_METADATA).map(([key, meta]) => (
						<TabsTrigger key={key} value={key}>
							{meta.label}
						</TabsTrigger>
					))}
				</TabsList>
			</Tabs>

			{(isPending || isFetching || showOfflineHint) && (
				<div className="rounded-lg border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
					{isPending || isFetching
						? "Loading cached lessons and checking for updates..."
						: "You're offline and this filter has no cached lessons yet"}
				</div>
			)}

			{lessons.length === 0 ? (
				<div className="flex flex-col items-center justify-center p-16 text-center rounded-xl border border-dashed bg-muted/20">
					<div className="h-16 w-16 bg-muted rounded-full flex items-center justify-center mb-4">
						<BookOpen className="h-8 w-8 text-muted-foreground/50" />
					</div>
					<h3 className="text-xl font-semibold text-foreground">
						No lessons found
					</h3>
					<p className="text-muted-foreground mt-2 max-w-sm">
						We couldn't find any lessons matching your filters. Try adjusting
						your search or categories.
					</p>
					{(search.q || search.subject) && (
						<Button
							variant="outline"
							onClick={() => navigate({ search: { page: 1, sort: "newest" } })}
							className="mt-6"
						>
							Clear Filters
						</Button>
					)}
				</div>
			) : (
				<div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
					{lessons.map((lesson) => (
						<StudentLessonCard key={lesson.id} lesson={lesson} />
					))}
				</div>
			)}

			{/* Pagination Controls */}
			{meta && meta.pageCount > 1 && (
				<div className="flex items-center justify-between border-t pt-4">
					<div className="text-sm text-muted-foreground">
						Page {meta.page} of {meta.pageCount}
					</div>
					<div className="flex items-center gap-2">
						<Button
							variant="outline"
							size="sm"
							onClick={() => handlePageChange((search.page || 1) - 1)}
							disabled={!meta.hasPreviousPage}
						>
							Previous
						</Button>
						<Button
							variant="outline"
							size="sm"
							onClick={() => handlePageChange((search.page || 1) + 1)}
							disabled={!meta.hasNextPage}
						>
							Next
						</Button>
					</div>
				</div>
			)}
		</div>
	);
}
