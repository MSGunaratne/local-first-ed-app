import { z } from "zod";
import type { Session } from "@/lib/auth-client";

export const cachedSessionUserSchema = z.object({
	id: z.string().min(1),
	name: z.string().min(1),
	role: z.string().min(1),
});

export type CachedSessionUser = z.infer<typeof cachedSessionUserSchema>;

export function parseCachedSessionUser(session: Session | null) {
	const result = cachedSessionUserSchema.safeParse(session?.user);
	return result.success ? result.data : null;
}

export async function cacheSessionUserForLocalInsert(
	session: Session | null,
): Promise<string | null> {
	const user = parseCachedSessionUser(session);
	if (!user) {
		return null;
	}

	const { execute } = await import("@/lib/local-db");
	const now = Math.floor(Date.now() / 1000);
	await execute(
		`INSERT INTO user (id, name, updated_at, role)
	 VALUES (?, ?, ?, ?)
	 ON CONFLICT(id) DO UPDATE SET
		name = excluded.name,
		updated_at = excluded.updated_at,
		role = excluded.role;`,
		[user.id, user.name, now, user.role],
	);

	return user.id;
}
