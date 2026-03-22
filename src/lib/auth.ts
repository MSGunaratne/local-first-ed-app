import { betterAuth } from "better-auth";
import { admin } from "better-auth/plugins";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";

import { db } from "../db";
import { ac, roles } from "src/lib/permissions";
import { users,accounts, sessions, verifications } from "#/features/users/users.schema";

import { Role } from "src/types/user";

export const auth = betterAuth({
	appName: "Local First Education",
	baseURL: process.env.BETTER_AUTH_URL,
	trustedOrigins: [process.env.BETTER_AUTH_URL!],

	database: drizzleAdapter(db, {
		provider: "sqlite",
		schema: {
			users,
			sessions,
			accounts,
			verifications,
		},
		usePlural: true,
	}),
	// https://www.better-auth.com/docs/reference/options#emailandpassword
	emailAndPassword: {
		enabled: true,
		disableSignUp: false, // Users are created by admins only
	},

	user: {
		additionalFields: {
			phoneNumber: { type: "string", required: false },
			role: { type: "string", input: false },
		},
	},

	session: {
		cookieCache: {
			enabled: true,
			maxAge: 5 * 60, // 5 minutes
			strategy: "compact", // Default https://www.better-auth.com/docs/concepts/session-management#cookie-cache-strategies
		},
	},

	logger: {
		level: process.env.NODE_ENV === "production" ? "error" : "debug",
	},

	advanced: {
		useSecureCookies: process.env.NODE_ENV === "production",
		database: {
			generateId: false,
		},
	},

	plugins: [
		admin({
			ac,
			roles,
			defaultRole: Role.TEACHER,
			adminRoles: [Role.SUPER_ADMIN, Role.ADMIN],
		}),
		tanstackStartCookies(),
	],
});
