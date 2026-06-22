import { AuthorizationError } from "@/db/utils/errors";
import { getTypedRole } from "@/types/user";
import {
	canModifyTeacherOwnedResource,
	getSessionRole,
	isAdminRole,
	isTeacherOrAdminRole,
} from "./roles";
import { requireServerSession } from "./session";

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
