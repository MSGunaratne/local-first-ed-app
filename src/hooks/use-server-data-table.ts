import { useNavigate, useSearch } from "@tanstack/react-router";
import type {
	ColumnFiltersState,
	OnChangeFn,
	PaginationState,
	RowSelectionState,
	SortingState,
	VisibilityState,
} from "@tanstack/react-table";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DataTableSearchParams } from "@/lib/dataTableSearchSchema";

// ----------------------------------------------------------------------
// Constants
// ----------------------------------------------------------------------

export const DEFAULT_PAGE_INDEX = 0;
export const DEFAULT_PAGE_SIZE = 10;

// ----------------------------------------------------------------------
// Types
// ----------------------------------------------------------------------

export type UseServerDataTableOptions = {
	/** Default page size when not specified in URL */
	defaultPageSize?: number;
	/** Default sorting when not specified in URL */
	defaultSorting?: SortingState;
	/** Default column visibility */
	defaultColumnVisibility?: VisibilityState;
};

export type ServerDataTableHandlers = {
	onPaginationChange: OnChangeFn<PaginationState>;
	onSortingChange: OnChangeFn<SortingState>;
	onColumnFiltersChange: OnChangeFn<ColumnFiltersState>;
	onGlobalFilterChange: OnChangeFn<string>;
	onRowSelectionChange: OnChangeFn<RowSelectionState>;
	onColumnVisibilityChange: OnChangeFn<VisibilityState>;
};

export type ServerDataTableQueryParams = {
	pagination: PaginationState;
	sorting: SortingState;
	columnFilters: ColumnFiltersState;
	globalFilter: string;
};

// ----------------------------------------------------------------------
// Utilities
// ----------------------------------------------------------------------

/**
 * Cleans empty/default params from object before updating URL.
 * Keeps URLs clean by omitting default values.
 */
function cleanEmptyParams<T extends Record<string, unknown>>(
	params: T,
	defaultPageSize: number,
): T {
	const cleaned = { ...params };
	for (const key of Object.keys(cleaned)) {
		const value = cleaned[key as keyof T];
		if (
			value === undefined ||
			value === null ||
			value === "" ||
			(Array.isArray(value) && value.length === 0)
		) {
			delete cleaned[key as keyof T];
		}
		if (key === "pageIndex" && value === DEFAULT_PAGE_INDEX) {
			delete cleaned[key as keyof T];
		}
		if (key === "pageSize" && value === defaultPageSize) {
			delete cleaned[key as keyof T];
		}
	}
	return cleaned;
}

/**
 * Cleans column filters for URL storage.
 * Removes filters with empty/null values, except for isEmpty/isNotEmpty operators.
 */
function cleanColumnFilters(filters: ColumnFiltersState): ColumnFiltersState {
	return filters.filter((item) => {
		// Keep isEmpty/isNotEmpty operators even without a value
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
		// Otherwise, require a non-empty value
		return item.value != null && item.value !== "";
	});
}

// ----------------------------------------------------------------------
// Hook
// ----------------------------------------------------------------------

/**
 * Hook that provides TanStack Table state synced with URL search params.
 *
 * ## Features
 * - **URL persistence**: Pagination, sorting, and filters are synced to URL
 * - **Immediate UI updates**: Local state ensures responsive UI
 * - **Browser history support**: Back/forward navigation works correctly
 * - **Configurable defaults**: Customize page size and default sorting
 * - **Row selection & column visibility**: Local state (not URL-persisted)
 *
 * ## Pattern
 * 1. Local state is the source of truth for UI rendering
 * 2. URL is updated in background for persistence/sharing
 * 3. URL changes (browser back/forward) sync back to local state
 *
 * @example
 * ```tsx
 * const { pagination, sorting, handlers, queryParams } = useServerDataTable({
 *   defaultPageSize: 20,
 *   defaultSorting: [{ id: 'createdAt', desc: true }],
 * });
 *
 * const { data } = useQuery(userQueries.list(queryParams));
 *
 * const table = useReactTable({
 *   data: data?.data ?? [],
 *   state: { pagination, sorting, ... },
 *   onPaginationChange: handlers.onPaginationChange,
 *   ...
 * });
 * ```
 */
export function useServerDataTable(options: UseServerDataTableOptions = {}) {
	const {
		defaultPageSize = DEFAULT_PAGE_SIZE,
		defaultSorting = [],
		defaultColumnVisibility = {},
	} = options;

	const search = useSearch({ strict: false }) as Partial<DataTableSearchParams>;
	const navigate = useNavigate();

	// Track if we're currently syncing from URL to avoid loops
	const isSyncingFromUrl = useRef(false);

	// ---------------------------------------------------------------------------
	// URL-Synced State (pagination, sorting, filters)
	// ---------------------------------------------------------------------------

	const [pagination, setPagination] = useState<PaginationState>({
		pageIndex: search.pageIndex ?? DEFAULT_PAGE_INDEX,
		pageSize: search.pageSize ?? defaultPageSize,
	});

	const [sorting, setSorting] = useState<SortingState>(
		search.sorting ?? defaultSorting,
	);

	const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>(
		search.columnFilters ?? [],
	);

	const [globalFilter, setGlobalFilter] = useState<string>(
		search.globalFilter ?? "",
	);

	// ---------------------------------------------------------------------------
	// Local-Only State (not persisted to URL)
	// ---------------------------------------------------------------------------

	const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
	const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(
		defaultColumnVisibility,
	);

	// ---------------------------------------------------------------------------
	// URL Sync: From URL to Local State
	// ---------------------------------------------------------------------------

	const lastUrlRef = useRef({
		pageIndex: search.pageIndex,
		pageSize: search.pageSize,
		sorting: search.sorting,
		columnFilters: search.columnFilters,
		globalFilter: search.globalFilter,
	});

	useEffect(() => {
		// Check if URL actually changed (not from our own navigate calls)
		const urlChanged =
			lastUrlRef.current.pageIndex !== search.pageIndex ||
			lastUrlRef.current.pageSize !== search.pageSize ||
			JSON.stringify(lastUrlRef.current.sorting) !==
				JSON.stringify(search.sorting) ||
			JSON.stringify(lastUrlRef.current.columnFilters) !==
				JSON.stringify(search.columnFilters) ||
			lastUrlRef.current.globalFilter !== search.globalFilter;

		if (urlChanged) {
			isSyncingFromUrl.current = true;

			setPagination({
				pageIndex: search.pageIndex ?? DEFAULT_PAGE_INDEX,
				pageSize: search.pageSize ?? defaultPageSize,
			});
			setSorting(search.sorting ?? defaultSorting);
			setColumnFilters(search.columnFilters ?? []);
			setGlobalFilter(search.globalFilter ?? "");

			lastUrlRef.current = {
				pageIndex: search.pageIndex,
				pageSize: search.pageSize,
				sorting: search.sorting,
				columnFilters: search.columnFilters,
				globalFilter: search.globalFilter,
			};

			// Reset sync flag after React processes the state updates
			requestAnimationFrame(() => {
				isSyncingFromUrl.current = false;
			});
		}
	}, [
		search.pageIndex,
		search.pageSize,
		search.sorting,
		search.columnFilters,
		search.globalFilter,
		defaultPageSize,
		defaultSorting,
	]);

	// ---------------------------------------------------------------------------
	// URL Sync: From Local State to URL
	// ---------------------------------------------------------------------------

	const syncToUrl = useCallback(
		(updates: Partial<DataTableSearchParams>) => {
			// Update the lastUrlRef so we don't re-sync our own changes
			Object.assign(lastUrlRef.current, updates);

			navigate({
				to: ".",
				search: (prev) =>
					cleanEmptyParams(
						{
							...prev,
							...updates,
						},
						defaultPageSize,
					),
				replace: true,
			});
		},
		[navigate, defaultPageSize],
	);

	/**
	 * Update URL search params directly.
	 * Useful for custom filter controls outside the table.
	 */
	const updateSearchParams = useCallback(
		(newParams: Partial<DataTableSearchParams>) => {
			syncToUrl(newParams);
		},
		[syncToUrl],
	);

	// ---------------------------------------------------------------------------
	// Change Handlers
	// ---------------------------------------------------------------------------

	const onPaginationChange: OnChangeFn<PaginationState> = useCallback(
		(updaterOrValue) => {
			setPagination((old) => {
				const newPagination =
					typeof updaterOrValue === "function"
						? updaterOrValue(old)
						: updaterOrValue;

				if (!isSyncingFromUrl.current) {
					syncToUrl({
						pageIndex: newPagination.pageIndex,
						pageSize: newPagination.pageSize,
					});
				}

				return newPagination;
			});
		},
		[syncToUrl],
	);

	const onSortingChange: OnChangeFn<SortingState> = useCallback(
		(updaterOrValue) => {
			setSorting((old) => {
				const newSorting =
					typeof updaterOrValue === "function"
						? updaterOrValue(old)
						: updaterOrValue;

				if (!isSyncingFromUrl.current) {
					syncToUrl({
						sorting: newSorting.length > 0 ? newSorting : undefined,
					});
				}

				return newSorting;
			});
		},
		[syncToUrl],
	);

	const onColumnFiltersChange: OnChangeFn<ColumnFiltersState> = useCallback(
		(updaterOrValue) => {
			setColumnFilters((old) => {
				const newFilters =
					typeof updaterOrValue === "function"
						? updaterOrValue(old)
						: updaterOrValue;

				if (!isSyncingFromUrl.current) {
					const cleanedFilters = cleanColumnFilters(newFilters);
					syncToUrl({
						columnFilters:
							cleanedFilters.length > 0 ? cleanedFilters : undefined,
						pageIndex: undefined, // Reset to first page
					});
					// Also reset pagination locally
					setPagination((p) => ({ ...p, pageIndex: DEFAULT_PAGE_INDEX }));
				}

				return newFilters;
			});
		},
		[syncToUrl],
	);

	const onGlobalFilterChange: OnChangeFn<string> = useCallback(
		(updaterOrValue) => {
			setGlobalFilter((old) => {
				const newValue =
					typeof updaterOrValue === "function"
						? updaterOrValue(old)
						: updaterOrValue;

				if (!isSyncingFromUrl.current) {
					syncToUrl({
						globalFilter: newValue || undefined,
						pageIndex: undefined, // Reset to first page
					});
					// Also reset pagination locally
					setPagination((p) => ({ ...p, pageIndex: DEFAULT_PAGE_INDEX }));
				}

				return newValue;
			});
		},
		[syncToUrl],
	);

	// ---------------------------------------------------------------------------
	// Utilities
	// ---------------------------------------------------------------------------

	/**
	 * Reset all filters and sorting to defaults.
	 * Also clears row selection.
	 */
	const resetFilters = useCallback(() => {
		setPagination({
			pageIndex: DEFAULT_PAGE_INDEX,
			pageSize: defaultPageSize,
		});
		setSorting(defaultSorting);
		setColumnFilters([]);
		setGlobalFilter("");
		setRowSelection({});
		navigate({ to: ".", search: {}, replace: true });
	}, [navigate, defaultPageSize, defaultSorting]);

	/**
	 * Number of active filters (column filters + global filter if set).
	 * Useful for showing filter badges in UI.
	 */
	const activeFilterCount = useMemo(() => {
		let count = columnFilters.length;
		if (globalFilter) count++;
		return count;
	}, [columnFilters, globalFilter]);

	/**
	 * Whether any filters are active.
	 */
	const hasActiveFilters = activeFilterCount > 0;

	// ---------------------------------------------------------------------------
	// Return
	// ---------------------------------------------------------------------------

	return {
		// State values for useReactTable
		pagination,
		sorting,
		columnFilters,
		globalFilter,
		rowSelection,
		columnVisibility,

		// Pre-wrapped handlers matching TanStack Table's On[State]Change signature
		handlers: {
			onPaginationChange,
			onSortingChange,
			onColumnFiltersChange,
			onGlobalFilterChange,
			onRowSelectionChange: setRowSelection,
			onColumnVisibilityChange: setColumnVisibility,
		} satisfies ServerDataTableHandlers,

		// Utilities
		resetFilters,
		updateSearchParams,
		activeFilterCount,
		hasActiveFilters,

		// Query params for server function / React Query
		queryParams: {
			pagination,
			sorting,
			columnFilters,
			globalFilter,
		} satisfies ServerDataTableQueryParams,
	};
}
