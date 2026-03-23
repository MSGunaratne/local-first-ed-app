import { AuthorizationError } from "@/db/utils/errors";
import { getTypedRole, Role } from "@/types/user";
import { requireServerSession } from "./session";

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

export async function requireSession(message = "You must be logged in") {
	return requireServerSession(message);
}

export async function requireAdminSession(
	message = "Only admins can perform this action",
) {
	const session = await requireSession();
	const role = getSessionRole(session);

	if (!isAdminRole(role)) {
		throw new AuthorizationError(message);
	}

	return session;
}

export async function requireTeacherOrAdminSession(
	message = "Only teachers and admins can perform this action",
) {
	const session = await requireSession();
	const role = getSessionRole(session);

	if (!isTeacherOrAdminRole(role)) {
		throw new AuthorizationError(message);
	}

	return session;
}

export function requireTeacherOwnershipOrAdmin(
	resourceOwnerId: string,
	currentUserId: string,
	role: unknown,
	message = "You do not have permission to modify this resource",
) {
	const typedRole = getTypedRole(role);

	if (
		!canModifyTeacherOwnedResource(typedRole, resourceOwnerId, currentUserId)
	) {
		throw new AuthorizationError(message);
	}
}
