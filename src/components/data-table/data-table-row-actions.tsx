import type { Row, RowData, Table } from "@tanstack/react-table";
import { Download, Loader2, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { DataTableFeatures } from "./data-table-features";

interface DataTableRowActionsProps<TData extends RowData> {
	table: Table<DataTableFeatures, TData>;
	onDeleteSelected?: (rows: Row<DataTableFeatures, TData>[]) => void;
}

/**
 * Bulk actions for selected rows.
 * Shows action buttons when rows are selected.
 */
export function DataTableRowActions<TData extends RowData>({
	table,
	onDeleteSelected,
}: DataTableRowActionsProps<TData>) {
	"use no memo";
	const selectedRows = table.getSelectedRowModel().rows;
	const hasSelection = selectedRows.length > 0;

	if (!hasSelection) {
		return null;
	}

	const handleDelete = () => {
		if (onDeleteSelected) {
			onDeleteSelected(selectedRows);
		}
	};

	return (
		<div className="flex items-center gap-2">
			<span className="text-sm text-muted-foreground">
				{selectedRows.length} row{selectedRows.length > 1 ? "s" : ""} selected
			</span>
			{onDeleteSelected && (
				<Button
					variant="destructive"
					size="sm"
					onClick={handleDelete}
					className="h-8"
				>
					<Trash2 className="mr-2 h-4 w-4" />
					Delete
				</Button>
			)}
		</div>
	);
}

// ============================================================================
// Export Utilities
// ============================================================================

type ExportFormat = "csv";

interface ExportOptions {
	filename?: string;
	/** Columns to exclude from export (by column id) */
	excludeColumns?: string[];
}

/**
 * Get table data as a 2D array (headers + rows)
 */
function getTableDataArray<TData extends RowData>(
	table: Table<DataTableFeatures, TData>,
	options: ExportOptions = {},
): string[][] {
	const { excludeColumns = ["actions", "select"] } = options;

	// Get visible columns (excluding specified ones)
	const columns = table
		.getAllColumns()
		.filter(
			(col) =>
				col.getIsVisible() &&
				!excludeColumns.includes(col.id) &&
				typeof col.accessorFn !== "undefined",
		);

	// Header row
	const headers = columns.map((col) => {
		const header = col.columnDef.header;
		if (typeof header === "string") return header;
		return col.id;
	});

	// Data rows - use all filtered rows, not just visible page
	const rows = table.getFilteredRowModel().rows.map((row) => {
		return columns.map((col) => {
			const value = row.getValue(col.id);
			if (value === null || value === undefined) return "";
			if (value instanceof Date) return value.toISOString();
			if (typeof value === "object") return JSON.stringify(value);
			return String(value);
		});
	});

	return [headers, ...rows];
}

/**
 * Export table data to CSV format
 */
function exportToCSV<TData extends RowData>(
	table: Table<DataTableFeatures, TData>,
	options: ExportOptions = {},
) {
	const { filename = "export" } = options;
	const timestamp = new Date().toISOString().split("T")[0];
	const fullFilename = `${filename}_${timestamp}.csv`;

	const data = getTableDataArray(table, options);

	// Convert to CSV string with proper escaping
	const csvContent = data
		.map((row) =>
			row
				.map((cell) => {
					if (cell.includes(",") || cell.includes('"') || cell.includes("\n")) {
						return `"${cell.replace(/"/g, '""')}"`;
					}
					return cell;
				})
				.join(","),
		)
		.join("\n");

	const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
	downloadBlob(blob, fullFilename);
}

/**
 * Triggers a file download in the browser
 */
function downloadBlob(blob: Blob, filename: string) {
	const url = URL.createObjectURL(blob);
	const link = document.createElement("a");
	link.href = url;
	link.download = filename;
	document.body.appendChild(link);
	link.click();
	document.body.removeChild(link);
	URL.revokeObjectURL(url);
}

/**
 * Export table data to the specified format
 */
export function exportTableData<TData extends RowData>(
	table: Table<DataTableFeatures, TData>,
	format: ExportFormat,
	options: ExportOptions = {},
) {
	if (format === "csv") {
		exportToCSV(table, options);
	}
}

interface DataTableExportProps<TData extends RowData> {
	table: Table<DataTableFeatures, TData>;
	filename?: string;
	onServerExport?: () => Promise<Record<string, unknown>[]>;
}

/**
 * Export dropdown button for the data table.
 * Supports CSV export — uses server-side export when `onServerExport` is provided,
 * otherwise falls back to exporting current client-side filtered rows.
 */
export function DataTableExport<TData extends RowData>({
	table,
	filename = "data",
	onServerExport,
}: DataTableExportProps<TData>) {
	const [isExporting, setIsExporting] = useState(false);

	const handleExport = async () => {
		if (onServerExport) {
			setIsExporting(true);
			try {
				const rows = await onServerExport();
				exportServerDataToCSV(rows, { filename });
			} finally {
				setIsExporting(false);
			}
		} else {
			exportTableData(table, "csv", { filename });
		}
	};

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					variant="outline"
					size="sm"
					className="h-8"
					disabled={isExporting}
				>
					{isExporting ? (
						<Loader2 className="mr-2 h-4 w-4 animate-spin" />
					) : (
						<Download className="mr-2 h-4 w-4" />
					)}
					Export
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end">
				<DropdownMenuItem onClick={handleExport} disabled={isExporting}>
					<Download className="mr-2 h-4 w-4" />
					Export as CSV
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

/**
 * Export server-fetched rows to CSV.
 * Works with raw row objects (not TanStack Table Row instances).
 */
function exportServerDataToCSV(
	rows: Record<string, unknown>[],
	options: ExportOptions = {},
) {
	const { filename = "export", excludeColumns = ["actions", "select"] } =
		options;
	const timestamp = new Date().toISOString().split("T")[0];
	const fullFilename = `${filename}_${timestamp}.csv`;

	if (rows.length === 0) return;

	// Derive headers from first row, excluding specified columns
	const headers = Object.keys(rows[0]).filter(
		(key) => !excludeColumns.includes(key),
	);

	const csvRows = rows.map((row) =>
		headers.map((key) => {
			const value = row[key];
			if (value === null || value === undefined) return "";
			if (value instanceof Date) return value.toISOString();
			if (typeof value === "object") return JSON.stringify(value);
			return String(value);
		}),
	);

	const data = [headers, ...csvRows];

	const csvContent = data
		.map((row) =>
			row
				.map((cell) => {
					if (cell.includes(",") || cell.includes('"') || cell.includes("\n")) {
						return `"${cell.replace(/"/g, '""')}"`;
					}
					return cell;
				})
				.join(","),
		)
		.join("\n");

	const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
	downloadBlob(blob, fullFilename);
}
