import { getRequestHeaders } from "@tanstack/react-start/server";
import { redirect } from "@tanstack/react-router";

import { auth } from "src/lib/auth";
import { ServerError } from "#/db/utils/errors";
import { safeAction } from "#/db/utils/safe-action";

//-----------------------------------------------

type SignInParams = {
	email: string;
	password: string;
	returnTo: string | undefined;
};

type SignUpParams = {
	email: string;
	password: string;
	name: string;
};

export async function signInWithPassword({
	email,
	password,
	returnTo,
}: SignInParams) {
	return safeAction(async () => {
		const { user } = await auth.api.signInEmail({
			body: { email, password },
		});

		if (!user) throw new ServerError("Sign-in failed");

		throw redirect({ to: returnTo ?? "/" });
	});
}

export async function signUp({ email, password, name }: SignUpParams) {
	return safeAction(async () => {
		const res = await auth.api.signUpEmail({
			body: { email, password, name },
		});

		if (!res) {
			throw new ServerError("Sign-up failed");
		}

		throw redirect({ to: "/sign-in" });
	});
}

export async function signOut({ returnTo }: { returnTo: string }) {
	return safeAction(async () => {
		await auth.api.signOut({ headers: await getRequestHeaders() });
		throw redirect({ to: returnTo ?? "/sign-in" });
	});
}

export async function changePassword({
	currentPassword,
	newPassword,
	revokeOtherSessions = true,
}: {
	currentPassword: string;
	newPassword: string;
	revokeOtherSessions?: boolean;
}) {
	return safeAction(async () => {
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
	});
}
