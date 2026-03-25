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
}

export function DataTable<TData>({ table, isLoading }: DataTableProps<TData>) {
	"use no memo";
	return (
		<div className="rounded-md border">
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
					{isLoading ? (
						<TableRow>
							<TableCell
								colSpan={table.getAllColumns().length}
								className="h-24 text-center"
							>
								<div className="flex items-center justify-center gap-2">
									<div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
									<span className="text-lg font-medium">Loading...</span>
								</div>
							</TableCell>
						</TableRow>
					) : table.getRowModel().rows?.length ? (
						table.getRowModel().rows.map((row) => (
							<TableRow
								key={row.id}
								data-state={row.getIsSelected() && "selected"}
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
							<TableCell
								colSpan={table.getAllColumns().length}
								className="h-24 text-center"
							>
								No results.
							</TableCell>
						</TableRow>
					)}
				</TableBody>
			</Table>
		</div>
	);
}
