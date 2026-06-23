import { useMutation, useQuery } from "@tanstack/react-query";
import {
	createFileRoute,
	Link,
	stripSearchParams,
} from "@tanstack/react-router";
import type { Row } from "@tanstack/react-table";
import {
	createColumnHelper,
	getCoreRowModel,
	useReactTable,
} from "@tanstack/react-table";
import { Edit, Eye, MoreHorizontal, Plus, Share, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
	DataTable,
	DataTableExport,
	DataTablePagination,
	DataTableRoutePending,
	DataTableRowActions,
	DataTableToolbar,
	DataTableViewOptions,
	getSelectionColumn,
} from "@/components/data-table";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	lessonMutations,
	lessonQueries,
} from "@/features/lessons/lessons.queries";
import type { Lesson } from "@/features/lessons/lessons.schema";
import { useServerDataTable } from "@/hooks/use-server-data-table";
import { useConnectionMode } from "@/lib/connection-mode";
import {
	DATA_TABLE_SEARCH_DEFAULTS,
	dataTableSearchSchema,
} from "@/lib/dataTableSearchSchema";
import { ensureQueryDataAfterRestore } from "@/lib/query-client";
import { m } from "@/paraglide/messages";
import { fDate } from "@/utils/format-time";

export const Route = createFileRoute("/_dashboard/lessons/")({
	validateSearch: dataTableSearchSchema,
	search: {
		middlewares: [stripSearchParams(DATA_TABLE_SEARCH_DEFAULTS)],
	},
	loaderDeps: ({ search }) => search,
	loader: async ({ context: { queryClient }, deps }) => {
		await ensureQueryDataAfterRestore(
			queryClient,
			lessonQueries.list({
				pagination: {
					pageIndex: deps.pageIndex,
					pageSize: deps.pageSize,
				},
				sorting: deps.sorting,
				columnFilters: deps.columnFilters,
				globalFilter: deps.globalFilter,
			}),
		);
	},
	pendingComponent: DashboardListRoutePending,
	pendingMs: 100,
	pendingMinMs: 150,
	component: LessonsPage,
});

const fallbackData: Lesson[] = [];

function DashboardListRoutePending() {
	return <DataTableRoutePending message={m.lessons_preparing()} />;
}

const columnHelper = createColumnHelper<Lesson>();

function LessonsPage() {
	const {
		pagination,
		sorting,
		columnFilters,
		globalFilter,
		rowSelection,
		columnVisibility,
		handlers,
		queryParams,
		isPending,
	} = useServerDataTable();
	const { isOnline } = useConnectionMode();

	const { data, isFetching } = useQuery(lessonQueries.list(queryParams));

	const [isMounted, setIsMounted] = useState(false);
	useEffect(() => {
		setIsMounted(true);
	}, []);

	const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
	const [rowsToDelete, setRowsToDelete] = useState<Row<Lesson>[]>([]);

	const { mutateAsync: deleteMutation } = useMutation({
		...lessonMutations.delete(),
		onSuccess: () => {
			handlers.onRowSelectionChange({});
		},
	});

	const handleDeleteSelected = (rows: Row<Lesson>[]) => {
		setRowsToDelete(rows);
		setDeleteDialogOpen(true);
	};

	const confirmDelete = async () => {
		await Promise.all(
			rowsToDelete.map((row) => deleteMutation(row.original.id)),
		);
		setDeleteDialogOpen(false);
		setRowsToDelete([]);
	};

	const columns = useMemo(
		() => [
			getSelectionColumn<Lesson>(),
			columnHelper.accessor("title", {
				header: m.lessons_table_title(),
				cell: ({ row }) => (
					<div className="flex flex-col">
						<span className="font-medium">{row.original.title}</span>
					</div>
				),
			}),
			columnHelper.accessor("subject", {
				header: m.lessons_table_subject(),
				cell: ({ getValue }) => {
					const subject = getValue<string>();
					return <Badge variant="secondary">{subject.toUpperCase()}</Badge>;
				},
			}),
			columnHelper.accessor("gradeLevel", {
				header: m.lessons_table_grade(),
				cell: ({ getValue }) => {
					return <span>{m.lessons_grade({ grade: getValue<number>() })}</span>;
				},
			}),
			columnHelper.accessor("createdAt", {
				header: m.common_created_at(),
				cell: ({ getValue }) => fDate(getValue()),
			}),
			columnHelper.display({
				id: "actions",
				header: () => <span className="sr-only">{m.common_actions()}</span>,
				cell: ({ row }) => (
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button variant="ghost" size="icon" className="h-8 w-8">
								<MoreHorizontal className="h-4 w-4" />
								<span className="sr-only">{m.common_open_menu()}</span>
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end">
							{row.original.isPublished && (
								<DropdownMenuItem asChild>
									<Link
										to="/student/lessons/$lessonId"
										params={{ lessonId: row.original.id }}
									>
										<Eye className="mr-2 h-4 w-4" />
										{m.common_preview()}
									</Link>
								</DropdownMenuItem>
							)}
							<DropdownMenuItem asChild>
								<Link
									to="/lessons/$lessonId/edit"
									params={{ lessonId: row.original.id }}
								>
									<Edit className="mr-2 h-4 w-4" />
									{m.common_edit()}
								</Link>
							</DropdownMenuItem>
							<DropdownMenuItem
								disabled={!row.original.isPublished || !isOnline}
								onClick={() => {
									const shareUrl = `${window.location.origin}/student/lessons/${row.original.id}`;
									const shareText = `Check out this lesson: ${row.original.title}`;

									if (navigator.share) {
										navigator
											.share({
												title: row.original.title,
												text: shareText,
												url: shareUrl,
											})
											.catch((error) => {
												if (error.name !== "AbortError") {
													window.open(
														`https://wa.me/?text=${encodeURIComponent(`${shareText} ${shareUrl}`)}`,
														"_blank",
													);
												}
											});
									} else {
										window.open(
											`https://wa.me/?text=${encodeURIComponent(`${shareText} ${shareUrl}`)}`,
											"_blank",
										);
									}
								}}
							>
								<Share className="mr-2 h-4 w-4" />
								{m.common_share()}
							</DropdownMenuItem>
							<DropdownMenuItem
								className="text-destructive"
								onClick={() => {
									setRowsToDelete([row]);
									setDeleteDialogOpen(true);
								}}
							>
								<Trash2 className="mr-2 h-4 w-4" />
								{m.common_delete()}
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				),
				enableSorting: false,
				enableHiding: false,
			}),
		],
		[isOnline],
	);

	const table = useReactTable({
		data: data?.data ?? fallbackData,
		columns,
		pageCount: data?.meta.pageCount ?? -1,
		getCoreRowModel: getCoreRowModel(),
		getRowId: (row) => row.id,
		manualPagination: true,
		manualSorting: true,
		manualFiltering: true,
		enableRowSelection: true,
		onPaginationChange: handlers.onPaginationChange,
		onSortingChange: handlers.onSortingChange,
		onColumnFiltersChange: handlers.onColumnFiltersChange,
		onGlobalFilterChange: handlers.onGlobalFilterChange,
		onRowSelectionChange: handlers.onRowSelectionChange,
		onColumnVisibilityChange: handlers.onColumnVisibilityChange,
		state: {
			pagination,
			sorting,
			columnFilters,
			globalFilter,
			rowSelection,
			columnVisibility,
		},
	});

	const hasRows = (data?.data.length ?? 0) > 0;
	const isTableRefetching = (isFetching || isPending) && hasRows;
	const isTableLoading = (isFetching || isPending) && !hasRows;

	return (
		<div className="space-y-4">
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-2xl font-bold tracking-tight">
						{m.lessons_title()}
					</h1>
					<p className="text-muted-foreground">{m.lessons_description()}</p>
				</div>
				<Button asChild>
					<Link to="/lessons/create">
						<Plus className="mr-2 h-4 w-4" />
						{m.lessons_add_button()}
					</Link>
				</Button>
			</div>

			<div className="flex items-center justify-between gap-2">
				<div className="flex items-center gap-2 flex-1">
					<DataTableToolbar
						globalFilter={globalFilter}
						onGlobalFilterChange={handlers.onGlobalFilterChange}
						placeholder={m.lessons_search_placeholder()}
					/>
					<DataTableRowActions
						table={table}
						onDeleteSelected={handleDeleteSelected}
					/>
				</div>
				<div className="flex items-center gap-2">
					<DataTableExport table={table} filename="lessons" />
					<DataTableViewOptions table={table} />
				</div>
			</div>

			<DataTable
				table={table}
				isLoading={isTableLoading || !isMounted}
				isRefetching={isTableRefetching}
			/>

			<DataTablePagination
				table={table}
				pageCount={data?.meta.pageCount ?? 0}
			/>

			<AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>
							{m.common_dialog_confirm_title()}
						</AlertDialogTitle>
						<AlertDialogDescription>
							{rowsToDelete.length === 1
								? m.lessons_delete_desc_single()
								: m.lessons_delete_desc_multi({
										count: rowsToDelete.length,
									})}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>{m.common_dialog_cancel()}</AlertDialogCancel>
						<AlertDialogAction
							onClick={confirmDelete}
							className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
						>
							{m.common_dialog_confirm()}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}
