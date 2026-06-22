import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import * as analyticsSchema from "@/features/analytics/analytics.schema";
import * as classSchema from "@/features/classes/classes.schema";
import * as lessonSchema from "@/features/lessons/lessons.schema";
import * as studentSchema from "@/features/students/students.schema";
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
		...analyticsSchema,
		...classSchema,
		...lessonSchema,
		...studentSchema,
	},
});
