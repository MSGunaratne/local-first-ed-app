import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth/minimal";
import { admin } from "better-auth/plugins";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import {
	accountRelations,
	sessionRelations,
	userRelations,
} from "#/db/relations";
import { ServerError } from "#/db/utils/errors";
import {
	accounts,
	sessions,
	users,
	verifications,
} from "#/features/users/users.schema";
import { hashPassword, verifyPassword } from "#/lib/auth/password";
import { ac, roles } from "#/lib/permissions";
import { Role } from "#/types/user";
import { db } from "../db";

const betterAuthUrl = process.env.BETTER_AUTH_URL;

if (!betterAuthUrl) {
	throw new ServerError("BETTER_AUTH_URL is required for auth configuration");
}

export const auth = betterAuth({
	appName: "Local First Education",
	baseURL: betterAuthUrl,

	trustedOrigins: [betterAuthUrl],

	database: drizzleAdapter(db, {
		provider: "sqlite",
		schema: {
			user: users,
			session: sessions,
			account: accounts,
			verification: verifications,
			userRelations: userRelations,
			sessionRelations: sessionRelations,
			accountRelations: accountRelations,
		},
	}),
	// https://www.better-auth.com/docs/reference/options#emailandpassword
	emailAndPassword: {
		enabled: true,
		disableSignUp: false, // Public sign-up is enabled for now.
		password: {
			hash: hashPassword,
			verify: verifyPassword,
		},
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
			joins: true,
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
