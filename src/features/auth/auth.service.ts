import { getRequestHeaders } from "@tanstack/react-start/server";

import { ServerError } from "#/db/utils/errors";
import type {
	ChangePasswordParams,
	SignInParams,
	SignUpParams,
} from "./auth.schema";

export async function signInWithPasswordService({
	email,
	password,
}: SignInParams) {
	const { auth } = await import("src/lib/auth");
	const headers = await getRequestHeaders();
	const { user } = await auth.api.signInEmail({
		headers,
		body: { email, password },
	});

	if (!user) {
		throw new ServerError("Sign-in failed");
	}
}

export async function signUpService({ email, password, name }: SignUpParams) {
	const { auth } = await import("src/lib/auth");
	const headers = await getRequestHeaders();
	const res = await auth.api.signUpEmail({
		headers,
		body: { email, password, name },
	});

	if (!res) {
		throw new ServerError("Sign-up failed");
	}
}

export async function signOutService() {
	const { auth } = await import("src/lib/auth");
	await auth.api.signOut({ headers: await getRequestHeaders() });
}

export async function changePasswordService({
	currentPassword,
	newPassword,
	revokeOtherSessions = true,
}: ChangePasswordParams) {
	const { auth } = await import("src/lib/auth");
	const result = await auth.api.changePassword({
		body: {
			currentPassword,
			newPassword,
			revokeOtherSessions,
		},
	});

	if (!result) {
		throw new ServerError("Failed to change password");
	}
}
