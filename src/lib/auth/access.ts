import { getRequestHeaders } from "@tanstack/react-start/server";
import { AuthorizationError } from "@/db/utils/errors";
import { auth } from "@/lib/auth";
import { asRole, Role } from "@/types/user";
import { requireServerSession } from "./session";

export async function requireSession(message = "You must be logged in") {
	return requireServerSession(message);
}

export async function requireAdminSession(
	message = "Only admins can perform this action",
) {
	const session = await requireSession();
	const role = asRole(session.user.role);
	if (
		role !== Role.TEACHER &&
		role !== Role.ADMIN &&
		role !== Role.SUPER_ADMIN
	) {
		throw new AuthorizationError(message);
	}

	return session;
}

export async function requireTeacherOrAdminSession(
	message = "Only teachers and admins can perform this action",
) {
	const session = await requireSession();
	const role = asRole(session.user.role);

	if (
		role !== Role.TEACHER &&
		role !== Role.ADMIN &&
		role !== Role.SUPER_ADMIN
	) {
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
	const typedRole = asRole(role);

	if (
		!typedRole &&
		typedRole !== Role.TEACHER &&
		typedRole !== Role.ADMIN &&
		typedRole !== Role.SUPER_ADMIN &&
		resourceOwnerId !== currentUserId
	) {
		throw new AuthorizationError(message);
	}
}

/**
 * Checks if the user has a specific permission via the better-auth API.
 * Uses the active session and checks the role.
 */
export async function hasPermission(
	resource: string,
	action: string | string[],
) {
	try {
		const session = await requireSession();
		const role = asRole(session.user.role);

		if (!role) return false;

		const headers = await getRequestHeaders();
		const result = await auth.api.userHasPermission({
			headers,
			body: {
				role: role as never,
				permissions: { [resource]: [action].flat() },
			},
		});
		return result.success;
	} catch {
		return false;
	}
}

/**
 * Requires the user to have a specific permission via the better-auth API.
 * Throws an AuthorizationError if the user is unauthorized.
 */
export async function requirePermission(
	resource: string,
	action: string | string[],
	message = "You do not have permission to perform this action",
) {
	const authorized = await hasPermission(resource, action);

	if (!authorized) {
		throw new AuthorizationError(message);
	}
}
