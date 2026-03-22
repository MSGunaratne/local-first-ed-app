import { drizzle } from "drizzle-orm/better-sqlite3";
import * as classSchema from "@/features/classes/classes.schema";
import * as lessonSchema from "@/features/lessons/lessons.schema";
import * as userSchema from "@/features/users/users.schema";

export const db = drizzle(process.env.DATABASE_URL!, {
	schema: { ...userSchema, ...classSchema, ...lessonSchema },
});
