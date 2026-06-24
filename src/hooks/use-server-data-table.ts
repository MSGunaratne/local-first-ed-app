import { useNavigate, useSearch } from "@tanstack/react-router";
import type {
	ColumnFiltersState,
	OnChangeFn,
	PaginationState,
	RowSelectionState,
	SortingState,
	VisibilityState,
} from "@tanstack/react-table";
import { useCallback, useMemo, useState, useTransition } from "react";
import {
	dataTableSearchSchema,
	type DataTableSearchParams,
} from "@/lib/dataTableSearchSchema";

// ----------------------------------------------------------------------
// Constants
// ----------------------------------------------------------------------

const DEFAULT_PAGE_INDEX = 0;
const DEFAULT_PAGE_SIZE = 10;
const partialDataTableSearchSchema = dataTableSearchSchema.partial();

// ----------------------------------------------------------------------
// Types
// ----------------------------------------------------------------------

type UseServerDataTableOptions = {
	/** Default page size when not specified in URL */
	defaultPageSize?: number;
	/** Default sorting when not specified in URL */
	defaultSorting?: SortingState;
	/** Default column visibility */
	defaultColumnVisibility?: VisibilityState;
};

type ServerDataTableHandlers = {
	onPaginationChange: OnChangeFn<PaginationState>;
	onSortingChange: OnChangeFn<SortingState>;
	onColumnFiltersChange: OnChangeFn<ColumnFiltersState>;
	onGlobalFilterChange: OnChangeFn<string>;
	onRowSelectionChange: OnChangeFn<RowSelectionState>;
	onColumnVisibilityChange: OnChangeFn<VisibilityState>;
};

type ServerDataTableQueryParams = {
	pagination: PaginationState;
	sorting: SortingState;
	columnFilters: ColumnFiltersState;
	globalFilter: string;
};

// ----------------------------------------------------------------------
// Utilities
// ----------------------------------------------------------------------

/**
 * Cleans column filters for URL storage.
 * Removes filters with empty/null values.
 */
function cleanColumnFilters(filters: ColumnFiltersState): ColumnFiltersState {
	return filters.filter((item) => {
		if (
			typeof item.value === "object" &&
			item.value !== null &&
			"operator" in item.value
		) {
			const operator = (item.value as { operator?: string }).operator;
			if (operator === "isEmpty" || operator === "isNotEmpty") {
				return true;
			}
		}
		return item.value != null && item.value !== "";
	});
}

// ----------------------------------------------------------------------
// Hook
// ----------------------------------------------------------------------

/**
 * Hook that provides TanStack Table state synced EXCLUSIVELY with URL search params.
 * Following 2026 Best Practices: URL is the Single Source of Truth.
 */
export function useServerDataTable(options: UseServerDataTableOptions = {}) {
	const {
		defaultPageSize = DEFAULT_PAGE_SIZE,
		defaultSorting = [],
		defaultColumnVisibility = {},
	} = options;

	const search = partialDataTableSearchSchema.parse(
		useSearch({ strict: false }),
	);
	const navigate = useNavigate();
	const [isPending, startTransition] = useTransition();

	// ---------------------------------------------------------------------------
	// Derived State from URL (The Source of Truth)
	// ---------------------------------------------------------------------------

	const pagination = useMemo(
		() => ({
			pageIndex: search.pageIndex ?? DEFAULT_PAGE_INDEX,
			pageSize: search.pageSize ?? defaultPageSize,
		}),
		[search.pageIndex, search.pageSize, defaultPageSize],
	);

	const sorting = useMemo(
		() => search.sorting ?? defaultSorting,
		[search.sorting, defaultSorting],
	);

	const columnFilters = useMemo(
		() => search.columnFilters ?? [],
		[search.columnFilters],
	);

	const globalFilter = useMemo(
		() => search.globalFilter ?? "",
		[search.globalFilter],
	);

	// ---------------------------------------------------------------------------
	// Local-Only State (UI-only, not persisted to URL)
	// ---------------------------------------------------------------------------

	const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
	const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(
		defaultColumnVisibility,
	);

	// ---------------------------------------------------------------------------
	// Handler Factory
	// ---------------------------------------------------------------------------

	/**
	 * Shared navigation helper that uses React 19 transitions to keep UI responsive.
	 */
	const updateSearch = useCallback(
		(
			updater: (
				prev: Partial<DataTableSearchParams>,
			) => Partial<DataTableSearchParams>,
		) => {
			startTransition(async () => {
				await navigate({
					to: ".",
					search: (prev) => updater(partialDataTableSearchSchema.parse(prev)),
					replace: true,
				});
			});
		},
		[navigate],
	);

	const onPaginationChange: OnChangeFn<PaginationState> = useCallback(
		(updaterOrValue) => {
			updateSearch((prev) => {
				const next =
					typeof updaterOrValue === "function"
						? updaterOrValue({
								pageIndex: prev.pageIndex ?? DEFAULT_PAGE_INDEX,
								pageSize: prev.pageSize ?? defaultPageSize,
							})
						: updaterOrValue;

				return {
					...prev,
					pageIndex:
						next.pageIndex === DEFAULT_PAGE_INDEX ? undefined : next.pageIndex,
					pageSize:
						next.pageSize === defaultPageSize ? undefined : next.pageSize,
				};
			});
		},
		[updateSearch, defaultPageSize],
	);

	const onSortingChange: OnChangeFn<SortingState> = useCallback(
		(updaterOrValue) => {
			updateSearch((prev) => {
				const next =
					typeof updaterOrValue === "function"
						? updaterOrValue(prev.sorting ?? defaultSorting)
						: updaterOrValue;

				return {
					...prev,
					sorting: next.length > 0 ? next : undefined,
				};
			});
		},
		[updateSearch, defaultSorting],
	);

	const onColumnFiltersChange: OnChangeFn<ColumnFiltersState> = useCallback(
		(updaterOrValue) => {
			updateSearch((prev) => {
				const next =
					typeof updaterOrValue === "function"
						? updaterOrValue(prev.columnFilters ?? [])
						: updaterOrValue;

				const cleaned = cleanColumnFilters(next);

				return {
					...prev,
					columnFilters: cleaned.length > 0 ? cleaned : undefined,
					pageIndex: undefined, // Reset to first page
				};
			});
		},
		[updateSearch],
	);

	const onGlobalFilterChange: OnChangeFn<string> = useCallback(
		(updaterOrValue) => {
			updateSearch((prev) => {
				const next =
					typeof updaterOrValue === "function"
						? updaterOrValue(prev.globalFilter ?? "")
						: updaterOrValue;

				return {
					...prev,
					globalFilter: next || undefined,
					pageIndex: undefined, // Reset to first page
				};
			});
		},
		[updateSearch],
	);

	const resetFilters = useCallback(() => {
		updateSearch(() => ({}));
		setRowSelection({});
	}, [updateSearch]);

	const activeFilterCount = useMemo(() => {
		let count = columnFilters.length;
		if (globalFilter) count++;
		return count;
	}, [columnFilters, globalFilter]);

	return {
		pagination,
		sorting,
		columnFilters,
		globalFilter,
		rowSelection,
		columnVisibility,
		isPending, // Exposed for UI loading indicators during transitions

		handlers: {
			onPaginationChange,
			onSortingChange,
			onColumnFiltersChange,
			onGlobalFilterChange,
			onRowSelectionChange: setRowSelection,
			onColumnVisibilityChange: setColumnVisibility,
		} satisfies ServerDataTableHandlers,

		resetFilters,
		activeFilterCount,
		hasActiveFilters: activeFilterCount > 0,

		queryParams: {
			pagination,
			sorting,
			columnFilters,
			globalFilter,
		} satisfies ServerDataTableQueryParams,
	};
}
