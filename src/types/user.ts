export type LabelColor =
	| "default"
	| "primary"
	| "secondary"
	| "info"
	| "success"
	| "warning"
	| "error";

export enum Role {
	SUPER_ADMIN = "super-admin",
	ADMIN = "admin",
	TEACHER = "teacher",
	STUDENT = "student",
}

export const ROLE_METADATA = {
	[Role.SUPER_ADMIN]: {
		label: "Super Admin",
		color: "info",
	},
	[Role.ADMIN]: {
		label: "Admin",
		color: "success",
	},
	[Role.TEACHER]: {
		label: "Teacher",
		color: "warning",
	},
	[Role.STUDENT]: {
		label: "Student",
		color: "default",
	},
} as const satisfies Record<Role, { label: string; color: LabelColor }>;

/**
 * Type guard to check if a value is a valid Role.
 * Use at boundaries where roles come from external sources (e.g., Better Auth session).
 */
export function isRole(value: unknown): value is Role {
	return (
		typeof value === "string" && Object.values(Role).includes(value as Role)
	);
}

export function getTypedRole(value: unknown) {
	return isRole(value) ? value : null;
}

export type SessionUser = {
	id: string;
	email: string;
	name: string;
	image: string | null;
	role: Role;
	phoneNumber: string | null;
};
