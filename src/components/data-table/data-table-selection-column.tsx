import type { ColumnDef, RowData } from "@tanstack/react-table";
import { Checkbox } from "@/components/ui/checkbox";
import type { DataTableFeatures } from "./data-table-features";

/**
 * Creates a selection column for row selection.
 * Add this as the first column in your columns array.
 *
 * IMPORTANT: Your table must have `getRowId` configured for selection to work.
 *
 * @example
 * ```tsx
 * const table = useTable({
 *   features: dataTableFeatures,
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
export function getSelectionColumn<TData extends RowData>(): ColumnDef<
	DataTableFeatures,
	TData
> {
	return {
		id: "select",
		header: ({ table }) => {
			const isAllSelected = table.getIsAllPageRowsSelected();
			const isSomeSelected =
				table.getIsSomePageRowsSelected() && !isAllSelected;

			return (
				<Checkbox
					checked={
						isAllSelected ? true : isSomeSelected ? "indeterminate" : false
					}
					onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
					aria-label="Select all rows on this page"
					className="translate-y-[2px]"
				/>
			);
		},
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
