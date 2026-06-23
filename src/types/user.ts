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

export const ROLE_GROUPS = {
	user: [Role.TEACHER, Role.STUDENT],
	admin: [Role.SUPER_ADMIN, Role.ADMIN],
} as const satisfies Record<string, readonly Role[]>;

export type UserRole = (typeof ROLE_GROUPS.user)[number];
export type AdminRole = (typeof ROLE_GROUPS.admin)[number];

export const USER_ROLE_METADATA = pickRoleMetadata(ROLE_GROUPS.user);

export const ADMIN_ROLE_METADATA = pickRoleMetadata(ROLE_GROUPS.admin);

type RoleGroup = keyof typeof ROLE_GROUPS;

export function asRole<G extends RoleGroup>(
	value: unknown,
	group: G,
): (typeof ROLE_GROUPS)[G][number] | null;
export function asRole(value: unknown): Role | null;
export function asRole(value: unknown, group?: RoleGroup) {
	if (typeof value !== "string") return null;

	const list = group
		? ROLE_GROUPS[group]
		: (Object.values(Role) as readonly string[]);

	return list.includes(value) ? value : null;
}

export type SessionUser = {
	id: string;
	email: string;
	name: string;
	image: string | null;
	role: Role;
	phoneNumber: string | null;
};

// ----------------------------------------------------------------------

function pickRoleMetadata<T extends Role>(roles: readonly T[]) {
	return Object.fromEntries(
		roles.map((role) => [role, ROLE_METADATA[role]]),
	) as {
		readonly [K in T]: (typeof ROLE_METADATA)[K];
	};
}
