import { mutationOptions } from "@tanstack/react-query";

import { unwrapResult } from "#/db/utils/safe-action";

import { signUp, signOut, changePassword, signInWithPassword } from "./action";

// ----------------------------------------------------------------------

export const authQueries = {
	all: () => ["auth"] as const,
	mutation: {
		signIn: () =>
			mutationOptions({
				mutationKey: [...authQueries.all(), "sign-in"],
				mutationFn: (data: Parameters<typeof signInWithPassword>[0]) =>
					unwrapResult(signInWithPassword(data)),
			}),
		signUp: () =>
			mutationOptions({
				mutationKey: [...authQueries.all(), "sign-up"],
				mutationFn: (data: Parameters<typeof signUp>[0]) =>
					unwrapResult(signUp(data)),
			}),
		signOut: () =>
			mutationOptions({
				mutationKey: [...authQueries.all(), "sign-out"],
				mutationFn: (data: Parameters<typeof signOut>[0]) =>
					unwrapResult(signOut(data)),
				meta: {
					successMessage: "Signed out successfully!",
					errorMessage: "Failed to sign out",
				},
			}),
		changePassword: () =>
			mutationOptions({
				mutationKey: [...authQueries.all(), "change-password"],
				mutationFn: (data: Parameters<typeof changePassword>[0]) =>
					unwrapResult(changePassword(data)),
				meta: {
					successMessage: "Password changed successfully!",
					errorMessage: "Failed to change password",
				},
			}),
	},
};
