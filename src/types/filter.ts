import type { DataTableQueryParams } from "@/lib/dataTableSearchSchema";
import type { Role } from "@/types/user";

// ------------------------------------------------------------

export const HIDE_COLUMNS = { id: false };

export const HIDE_COLUMNS_TOGGLABLE = ["id", "actions"];

export interface UserSearchParams extends DataTableQueryParams {
	role?: Role;
}
