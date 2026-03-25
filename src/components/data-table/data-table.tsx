import type { Table as TanStackTable } from "@tanstack/react-table";
import { flexRender } from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

interface DataTableProps<TData> {
	table: TanStackTable<TData>;
	isLoading?: boolean;
	isRefetching?: boolean;
}

export function DataTable<TData>({
	table,
	isLoading,
	isRefetching,
}: DataTableProps<TData>) {
	"use no memo";
	const rows = table.getRowModel().rows;
	const hasRows = rows.length > 0;
	const columnCount = Math.max(1, table.getVisibleLeafColumns().length);
	const showInitialLoading = !!isLoading && !hasRows;
	const showRefetchOverlay = !!isRefetching && hasRows;

	return (
		<div className="relative rounded-md border">
			{showRefetchOverlay ? (
				<div className="pointer-events-none absolute right-3 top-3 z-10 rounded-md border bg-background/90 px-2 py-1 shadow-sm">
					<div className="flex items-center gap-2 text-xs text-muted-foreground">
						<div className="h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent" />
						<span>Updating...</span>
					</div>
				</div>
			) : null}
			<Table>
				<TableHeader>
					{table.getHeaderGroups().map((headerGroup) => (
						<TableRow key={headerGroup.id}>
							{headerGroup.headers.map((header) => {
								const canSort = header.column.getCanSort();
								const sorted = header.column.getIsSorted();

								return (
									<TableHead
										key={header.id}
										className={cn(
											canSort && "cursor-pointer select-none",
											"px-4 py-4",
										)}
										onClick={header.column.getToggleSortingHandler()}
									>
										{header.isPlaceholder ? null : (
											<div className="flex items-center gap-2">
												<span className="text-sm font-bold uppercase tracking-wider text-muted-foreground/80">
													{flexRender(
														header.column.columnDef.header,
														header.getContext(),
													)}
												</span>
												{canSort && (
													<span className="text-muted-foreground">
														{sorted === "asc" ? (
															<ArrowUp className="h-4 w-4" />
														) : sorted === "desc" ? (
															<ArrowDown className="h-4 w-4" />
														) : (
															<ArrowUpDown className="h-4 w-4" />
														)}
													</span>
												)}
											</div>
										)}
									</TableHead>
								);
							})}
						</TableRow>
					))}
				</TableHeader>
				<TableBody>
					{showInitialLoading ? (
						<TableRow>
							<TableCell colSpan={columnCount} className="h-24 text-center">
								<div className="flex items-center justify-center gap-2">
									<div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
									<span className="text-lg font-medium">Loading...</span>
								</div>
							</TableCell>
						</TableRow>
					) : hasRows ? (
						rows.map((row) => (
							<TableRow
								key={row.id}
								data-state={row.getIsSelected() ? "selected" : undefined}
								className="hover:bg-muted/50 transition-colors"
							>
								{row.getVisibleCells().map((cell) => (
									<TableCell key={cell.id} className="px-4 py-4 text-base">
										{flexRender(cell.column.columnDef.cell, cell.getContext())}
									</TableCell>
								))}
							</TableRow>
						))
					) : (
						<TableRow>
							<TableCell colSpan={columnCount} className="h-24 text-center">
								No results.
							</TableCell>
						</TableRow>
					)}
				</TableBody>
			</Table>
		</div>
	);
}
