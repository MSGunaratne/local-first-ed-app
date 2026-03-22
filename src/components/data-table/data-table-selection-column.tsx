import type { ColumnDef } from "@tanstack/react-table";
import { Checkbox } from "@/components/ui/checkbox";

/**
 * Creates a selection column for row selection.
 * Add this as the first column in your columns array.
 *
 * IMPORTANT: Your table must have `getRowId` configured for selection to work.
 *
 * @example
 * ```tsx
 * const table = useReactTable({
 *   getRowId: (row) => row.id, // Required!
 *   enableRowSelection: true,
 *   onRowSelectionChange: setRowSelection,
 *   state: { rowSelection },
 *   // ...
 * });
 *
 * const columns = [
 *   getSelectionColumn<User>(),
 *   { accessorKey: "name", header: "Name" },
 * ];
 * ```
 */
export function getSelectionColumn<TData>(): ColumnDef<TData> {
	return {
		id: "select",
		header: ({ table }) => (
			<Checkbox
				checked={
					table.getIsAllPageRowsSelected() ||
					(table.getIsSomePageRowsSelected() && "indeterminate")
				}
				onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
				aria-label="Select all rows on this page"
				className="translate-y-[2px]"
			/>
		),
		cell: ({ row }) => (
			<Checkbox
				checked={row.getIsSelected()}
				disabled={!row.getCanSelect()}
				onCheckedChange={(value) => row.toggleSelected(!!value)}
				aria-label="Select row"
			/>
		),
		enableSorting: false,
		enableHiding: false,
	};
}
