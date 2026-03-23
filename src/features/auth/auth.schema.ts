import { z } from "zod";

export const signInSchema = z.object({
	email: z.email(),
	password: z.string().min(1),
	returnTo: z.string().max(2048).optional(),
});

export const signUpSchema = z.object({
	email: z.email(),
	password: z.string().min(6),
	name: z.string().min(1),
});

export const signOutSchema = z.object({
	returnTo: z.string().max(2048).optional(),
});

export const changePasswordSchema = z.object({
	currentPassword: z.string().min(1),
	newPassword: z
		.string()
		.min(8, "New password must be at least 8 characters!")
		.max(255, "New password must be at most 255 characters!")
		.regex(/[a-z]/, "Must include 1 lowercase letter")
		.regex(/[A-Z]/, "Must include 1 uppercase letter")
		.regex(/\d/, "Must include 1 number")
		.regex(/[!@#$%^&*(),.?":{}|<>]/, "Must include 1 symbol"),
	revokeOtherSessions: z.boolean().optional(),
});

export type SignInParams = z.infer<typeof signInSchema>;
export type SignUpParams = z.infer<typeof signUpSchema>;
export type SignOutParams = z.infer<typeof signOutSchema>;
export type ChangePasswordParams = z.infer<typeof changePasswordSchema>;
