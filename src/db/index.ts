import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import * as classSchema from "@/features/classes/classes.schema";
import * as lessonSchema from "@/features/lessons/lessons.schema";
import * as userSchema from "@/features/users/users.schema";

export const db = drizzle(env.ed_app_db, {
	schema: {
		user: userSchema.users,
		session: userSchema.sessions,
		account: userSchema.accounts,
		verification: userSchema.verifications,
		userRelations: userSchema.userRelations,
		sessionRelations: userSchema.sessionRelations,
		accountRelations: userSchema.accountRelations,
		...classSchema,
		...lessonSchema,
	},
});
