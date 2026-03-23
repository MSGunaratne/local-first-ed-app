import { mutationOptions } from "@tanstack/react-query";

import {
	changePassword,
	signInWithPassword,
	signOut,
	signUp,
} from "./auth.actions";

// ----------------------------------------------------------------------

export const authMutations = {
	all: () => ["auth"] as const,
	signIn: () =>
		mutationOptions({
			mutationKey: [...authMutations.all(), "sign-in"],
			mutationFn: (data: Parameters<typeof signInWithPassword>[0]) =>
				signInWithPassword(data),
		}),
	signUp: () =>
		mutationOptions({
			mutationKey: [...authMutations.all(), "sign-up"],
			mutationFn: (data: Parameters<typeof signUp>[0]) => signUp(data),
		}),
	signOut: () =>
		mutationOptions({
			mutationKey: [...authMutations.all(), "sign-out"],
			mutationFn: (data: Parameters<typeof signOut>[0]) => signOut(data),
			meta: {
				successMessage: "Signed out successfully!",
				errorMessage: "Failed to sign out",
			},
		}),
	changePassword: () =>
		mutationOptions({
			mutationKey: [...authMutations.all(), "change-password"],
			mutationFn: (data: Parameters<typeof changePassword>[0]) =>
				changePassword(data),
			meta: {
				successMessage: "Password changed successfully!",
				errorMessage: "Failed to change password",
			},
		}),
};
