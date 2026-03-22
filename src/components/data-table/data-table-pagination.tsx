import type { Table } from "@tanstack/react-table";
import {
	ChevronLeft,
	ChevronRight,
	ChevronsLeft,
	ChevronsRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";

interface DataTablePaginationProps<TData> {
	table: Table<TData>;
	pageCount: number;
	pageSizeOptions?: number[];
	totalItems?: number;
}

export function DataTablePagination<TData>({
	table,
	pageCount,
	pageSizeOptions = [10, 20, 30, 50, 100],
	totalItems,
}: DataTablePaginationProps<TData>) {
	"use no memo";
	const { pageIndex, pageSize } = table.getState().pagination;
	const selectedCount = table.getSelectedRowModel().rows.length;

	return (
		<div className="flex flex-col items-center justify-between gap-4 px-2 py-4 sm:flex-row">
			<div className="flex items-center gap-4">
				{/* Row selection info / total count */}
				{totalItems != null && (
					<p className="text-sm text-muted-foreground">
						{selectedCount > 0
							? `${selectedCount} of ${totalItems} row(s) selected`
							: `${totalItems} total row(s)`}
					</p>
				)}

				<div className="flex items-center space-x-2">
					<p className="text-sm font-medium">Rows per page</p>
					<Select
						value={`${pageSize}`}
						onValueChange={(value) => {
							table.setPageSize(Number(value));
						}}
					>
						<SelectTrigger className="h-8 w-[70px]">
							<SelectValue placeholder={pageSize} />
						</SelectTrigger>
						<SelectContent side="top">
							{pageSizeOptions.map((size) => (
								<SelectItem key={size} value={`${size}`}>
									{size}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
			</div>

			<div className="flex items-center space-x-2">
				<span className="text-sm text-muted-foreground">
					Page {pageIndex + 1} of {pageCount || 1}
				</span>

				<div className="flex items-center space-x-1">
					<Button
						variant="outline"
						size="icon"
						className="h-8 w-8"
						onClick={() => table.setPageIndex(0)}
						disabled={!table.getCanPreviousPage()}
					>
						<ChevronsLeft className="h-4 w-4" />
						<span className="sr-only">Go to first page</span>
					</Button>
					<Button
						variant="outline"
						size="icon"
						className="h-8 w-8"
						onClick={() => table.previousPage()}
						disabled={!table.getCanPreviousPage()}
					>
						<ChevronLeft className="h-4 w-4" />
						<span className="sr-only">Go to previous page</span>
					</Button>
					<Button
						variant="outline"
						size="icon"
						className="h-8 w-8"
						onClick={() => table.nextPage()}
						disabled={!table.getCanNextPage()}
					>
						<ChevronRight className="h-4 w-4" />
						<span className="sr-only">Go to next page</span>
					</Button>
					<Button
						variant="outline"
						size="icon"
						className="h-8 w-8"
						onClick={() => table.setPageIndex(pageCount - 1)}
						disabled={!table.getCanNextPage()}
					>
						<ChevronsRight className="h-4 w-4" />
						<span className="sr-only">Go to last page</span>
					</Button>
				</div>
			</div>
		</div>
	);
}
