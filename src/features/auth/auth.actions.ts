import { createServerFn } from "@tanstack/react-start";
import type {
	ChangePasswordParams,
	SignInParams,
	SignOutParams,
	SignUpParams,
} from "./auth.schema";
import {
	changePasswordSchema,
	signInSchema,
	signOutSchema,
	signUpSchema,
} from "./auth.schema";
import {
	changePasswordService,
	signInWithPasswordService,
	signOutService,
	signUpService,
} from "./auth.service";

const signInWithPasswordFn = createServerFn({ method: "POST" })
	.inputValidator((data) => signInSchema.parse(data))
	.handler(async ({ data }) => {
		await signInWithPasswordService({
			email: data.email,
			password: data.password,
		});

		return { redirectTo: data.returnTo ?? "/" };
	});

const signUpFn = createServerFn({ method: "POST" })
	.inputValidator((data) => signUpSchema.parse(data))
	.handler(async ({ data }) => {
		await signUpService(data);

		return { redirectTo: "/sign-in" };
	});

const signOutFn = createServerFn({ method: "POST" })
	.inputValidator((data) => signOutSchema.parse(data))
	.handler(async ({ data }) => {
		await signOutService();

		return { redirectTo: data.returnTo ?? "/sign-in" };
	});

const changePasswordFn = createServerFn({ method: "POST" })
	.inputValidator((data) => changePasswordSchema.parse(data))
	.handler(async ({ data }) => {
		await changePasswordService(data);
	});

export async function signInWithPassword(data: SignInParams) {
	return signInWithPasswordFn({ data });
}

export async function signUp(data: SignUpParams) {
	return signUpFn({ data });
}

export async function signOut(data: SignOutParams) {
	return signOutFn({ data });
}

export async function changePassword(data: ChangePasswordParams) {
	return changePasswordFn({ data });
}
