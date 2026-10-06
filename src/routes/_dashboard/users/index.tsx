import { useMutation, useQuery } from "@tanstack/react-query";
import {
	createFileRoute,
	Link,
	stripSearchParams,
} from "@tanstack/react-router";
import type { Row } from "@tanstack/react-table";
import { createColumnHelper, useTable } from "@tanstack/react-table";
import { Edit, MoreHorizontal, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { formatPhoneNumber } from "react-phone-number-input";
import {
	DataTable,
	DataTableExport,
	type DataTableFeatures,
	DataTablePagination,
	DataTableRoutePending,
	DataTableRowActions,
	DataTableToolbar,
	DataTableViewOptions,
	dataTableFeatures,
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
import { userMutations, userQueries } from "@/features/users/users.queries";
import type { User } from "@/features/users/users.schema";
import { useServerDataTable } from "@/hooks/use-server-data-table";
import {
	DATA_TABLE_SEARCH_DEFAULTS,
	dataTableSearchSchema,
} from "@/lib/dataTableSearchSchema";
import { ensureQueryDataAfterRestore } from "@/lib/query-client";
import { m } from "@/paraglide/messages";
import { ROLE_METADATA } from "@/types/user";
import { fDate } from "@/utils/format-time";

export const Route = createFileRoute("/_dashboard/users/")({
	validateSearch: dataTableSearchSchema,
	search: {
		middlewares: [stripSearchParams(DATA_TABLE_SEARCH_DEFAULTS)],
	},
	loaderDeps: ({ search }) => search,
	loader: async ({ context: { queryClient }, deps }) => {
		await ensureQueryDataAfterRestore(
			queryClient,
			userQueries.list({
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
	component: UsersPage,
});

// Stable fallback to prevent re-render loops from new [] reference each render
const fallbackData: User[] = [];

function DashboardListRoutePending() {
	return <DataTableRoutePending message={m.users_preparing()} />;
}

const columnHelper = createColumnHelper<DataTableFeatures, User>();

function UsersPage() {
	const { session } = Route.useRouteContext();
	const canManageUsers =
		session.user.role === "admin" || session.user.role === "super-admin";
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

	const { data, isFetching } = useQuery(userQueries.list(queryParams));

	const [isMounted, setIsMounted] = useState(false);
	useEffect(() => {
		setIsMounted(true);
	}, []);

	const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
	const [rowsToDelete, setRowsToDelete] = useState<
		Row<DataTableFeatures, User>[]
	>([]);

	const { mutateAsync: deleteMutation } = useMutation({
		...userMutations.delete(),
		onSuccess: () => {
			handlers.onRowSelectionChange({});
		},
	});

	const handleDeleteSelected = (rows: Row<DataTableFeatures, User>[]) => {
		setRowsToDelete(rows);
		setDeleteDialogOpen(true);
	};

	const confirmDelete = async () => {
		const userIds = rowsToDelete.map((row) => row.original.id);
		await Promise.all(userIds.map((id) => deleteMutation(id)));
		setDeleteDialogOpen(false);
		setRowsToDelete([]);
	};

	const handleExport = useCallback(
		() =>
			userQueries.exportAll({
				sorting: queryParams.sorting,
				columnFilters: queryParams.columnFilters,
				globalFilter: queryParams.globalFilter,
			}),
		[queryParams.sorting, queryParams.columnFilters, queryParams.globalFilter],
	);

	const columns = useMemo(
		() =>
			columnHelper.columns([
				...(canManageUsers ? [getSelectionColumn<User>()] : []),
				columnHelper.accessor("name", {
					header: m.users_table_name(),
					cell: ({ row }) => (
						<div className="flex flex-col">
							<span className="font-medium">{row.original.name}</span>
							<span className="text-sm text-muted-foreground">
								{row.original.email}
							</span>
						</div>
					),
				}),
				columnHelper.accessor("email", {
					header: m.users_table_email(),
				}),
				columnHelper.accessor("phoneNumber", {
					header: m.users_table_phone(),
					cell: ({ getValue }) => {
						const value = getValue<string | null>();
						return value ? formatPhoneNumber(value) : "—";
					},
				}),
				columnHelper.accessor("role", {
					header: m.users_table_role(),
					cell: ({ getValue }) => {
						const role = getValue<User["role"]>();
						const roleMetadata = ROLE_METADATA[role];
						return (
							<Badge variant="default" color={roleMetadata.color}>
								{roleMetadata.label}
							</Badge>
						);
					},
				}),
				columnHelper.accessor("createdAt", {
					header: m.common_created_at(),
					cell: ({ getValue }) => fDate(getValue()),
				}),
				columnHelper.display({
					id: "actions",
					header: () => <span className="sr-only">{m.common_actions()}</span>,
					cell: ({ row }) =>
						canManageUsers || row.original.id === session.user.id ? (
							<DropdownMenu>
								<DropdownMenuTrigger asChild>
									<Button variant="ghost" size="icon" className="h-8 w-8">
										<MoreHorizontal className="h-4 w-4" />
										<span className="sr-only">{m.common_open_menu()}</span>
									</Button>
								</DropdownMenuTrigger>
								<DropdownMenuContent align="end">
									<DropdownMenuItem asChild>
										<Link
											to="/users/$userId/edit"
											params={{ userId: row.original.id }}
										>
											<Edit className="mr-2 h-4 w-4" />
											{m.common_edit()}
										</Link>
									</DropdownMenuItem>
									{canManageUsers && (
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
									)}
								</DropdownMenuContent>
							</DropdownMenu>
						) : null,
					enableSorting: false,
					enableHiding: false,
				}),
			]),
		[canManageUsers, session.user.id],
	);

	const table = useTable({
		features: dataTableFeatures,
		data: data?.data ?? fallbackData,
		columns,
		pageCount: data?.meta.pageCount ?? -1,
		getRowId: (row) => row.id,
		// Manual modes for server-side operations
		manualPagination: true,
		manualSorting: true,
		manualFiltering: true,
		autoResetPageIndex: false,
		// Enable features
		enableRowSelection: canManageUsers,
		// State change handlers - URL-synced state (from hook)
		onPaginationChange: handlers.onPaginationChange,
		onSortingChange: handlers.onSortingChange,
		onColumnFiltersChange: handlers.onColumnFiltersChange,
		onGlobalFilterChange: handlers.onGlobalFilterChange,
		// State change handlers - local state (from hook)
		onRowSelectionChange: handlers.onRowSelectionChange,
		onColumnVisibilityChange: handlers.onColumnVisibilityChange,
		// Combined state - use values directly from hook for URL-synced state
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
			{/* Header */}
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-2xl font-bold tracking-tight">
						{m.users_title()}
					</h1>
					<p className="text-muted-foreground">{m.users_description()}</p>
				</div>
				{canManageUsers && (
					<Button asChild>
						<Link to="/users/create">
							<Plus className="mr-2 h-4 w-4" />
							{m.users_add_button()}
						</Link>
					</Button>
				)}
			</div>

			{/* Toolbar */}
			<div className="flex items-center justify-between gap-2">
				<div className="flex items-center gap-2 flex-1">
					<DataTableToolbar
						globalFilter={globalFilter}
						onGlobalFilterChange={handlers.onGlobalFilterChange}
						placeholder={m.users_search_placeholder()}
					/>
					{canManageUsers && (
						<DataTableRowActions
							table={table}
							onDeleteSelected={handleDeleteSelected}
						/>
					)}
				</div>
				<div className="flex items-center gap-2">
					{canManageUsers && (
						<DataTableExport
							table={table}
							filename="users"
							onServerExport={handleExport}
						/>
					)}
					<DataTableViewOptions table={table} />
				</div>
			</div>

			{/* Table */}
			<DataTable
				table={table}
				isLoading={isTableLoading || !isMounted}
				isRefetching={isTableRefetching}
			/>

			{/* Pagination */}
			<DataTablePagination
				table={table}
				pageCount={data?.meta.pageCount ?? 0}
				totalItems={data?.meta.itemCount}
			/>

			<AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>
							{m.common_dialog_confirm_title()}
						</AlertDialogTitle>
						<AlertDialogDescription>
							{rowsToDelete.length === 1
								? m.users_delete_desc_single()
								: m.users_delete_desc_multi({
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
