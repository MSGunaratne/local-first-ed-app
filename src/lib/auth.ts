import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin } from "better-auth/plugins";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import {
	accounts,
	sessions,
	users,
	verifications,
} from "@/features/users/users.schema";
import { roles, ac } from "./permissions";
import { Role } from "@/types/user";
import { db } from "../db";

export const auth = betterAuth({
	database: drizzleAdapter(db, {
		provider: "sqlite",
		schema: { users, sessions, accounts, verifications },
		usePlural: true,
	}),
	emailAndPassword: {
		enabled: true,
	},
	user: {
		additionalFields: {
			phoneNumber: { type: "string", required: false },
			role: { type: "string", input: false },
		},
	},
	session: {
		expiresIn: 60 * 60 * 24 * 7, // 7 days
		rolling: true,
		updateAge: 60 * 60 * 24,
		freshAge: 60 * 60 * 24, // 1 day
		refreshToken: {
			enabled: true,
			expiresIn: 60 * 60 * 24 * 30, // 30 days
			rotationInterval: 60 * 30, // 30 minutes
		},
		cookieCache: {
			//enabled: true,
			maxAge: 5 * 60, // 5 minutes
		},
	},
	cookies: {
		secure: process.env.NODE_ENV === "production",
		sameSite: "lax",
		httpOnly: true,
		path: "/",
		maxAge: 60 * 60 * 24 * 7,
	},
	advanced: {
		database: {
			generateId: false,
		},
	},

	plugins: [
		admin({ ac, roles, defaultRole: Role.TEACHER }),
		tanstackStartCookies(),
	],
});
