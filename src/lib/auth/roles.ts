import { getTypedRole, Role } from "@/types/user";

export function getSessionRole(session: { user: { role: unknown } } | null) {
	if (!session) return null;
	return getTypedRole(session.user.role);
}

export function isAdminRole(role: Role | null) {
	return role === Role.SUPER_ADMIN || role === Role.ADMIN;
}

export function isTeacherOrAdminRole(role: Role | null) {
	return isAdminRole(role) || role === Role.TEACHER;
}

export function canModifyTeacherOwnedResource(
	role: Role | null,
	resourceOwnerId: string,
	currentUserId: string,
) {
	return isAdminRole(role) || resourceOwnerId === currentUserId;
}
