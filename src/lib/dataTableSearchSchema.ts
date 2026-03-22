import type {
	ColumnFiltersState,
	PaginationState,
	SortingState,
} from "@tanstack/react-table";
import { z } from "zod";

// ----------------------------------------------------------------------
// Defaults — exported for use with `stripSearchParams` middleware
// ----------------------------------------------------------------------

export const DATA_TABLE_SEARCH_DEFAULTS = {
	pageIndex: 0,
	pageSize: 10,
	sorting: [] as { id: string; desc: boolean }[],
	columnFilters: [] as { id: string; value: unknown }[],
	globalFilter: "",
};

/**
 * Schema for data table URL search params.
 *
 * Uses Zod v4's `.default().catch()` pattern so that:
 *  - Malformed/missing params fall back gracefully (no error screens)
 *  - `<Link>` `search` prop is optional (Standard Schema infers input as optional)
 *  - `stripSearchParams` middleware keeps URLs clean
 *
 * Clean URL examples:
 * - `/users` = all defaults
 * - `/users?pageIndex=2` = page 3
 * - `/users?globalFilter=john` = searching
 */
export const dataTableSearchSchema = z.object({
	// Pagination - flat params for clean URLs
	pageIndex: z.number().default(0).catch(0),
	pageSize: z.number().default(10).catch(10),

	// Sorting - array of sort objects (only in URL when active)
	sorting: z
		.array(
			z.object({
				id: z.string(),
				desc: z.boolean(),
			}),
		)
		.default([])
		.catch([]),

	// Column filters (only in URL when active)
	columnFilters: z
		.array(
			z.object({
				id: z.string(),
				value: z.unknown(),
			}),
		)
		.default([])
		.catch([]),

	// Global search filter
	globalFilter: z.string().default("").catch(""),
});

export type DataTableSearchParams = z.infer<typeof dataTableSearchSchema>;

export interface DataTableQueryParams {
	pagination: PaginationState;
	sorting: SortingState;
	columnFilters: ColumnFiltersState;
	globalFilter: string;
}
