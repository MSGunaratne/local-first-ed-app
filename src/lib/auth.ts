import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";
import { admin } from "better-auth/plugins";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import {
	accounts,
	sessions,
	users,
	verifications,
} from "#/features/users/users.schema";
import { ac, roles } from "#/lib/permissions";
import { Role } from "#/types/user";
import { db } from "../db";

const betterAuthUrl = process.env.BETTER_AUTH_URL;

if (!betterAuthUrl) {
	throw new Error("BETTER_AUTH_URL is required for auth configuration");
}

export const auth = betterAuth({
	appName: "Local First Education",
	baseURL: betterAuthUrl,

	trustedOrigins: [betterAuthUrl],

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
			enabled: false,
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
