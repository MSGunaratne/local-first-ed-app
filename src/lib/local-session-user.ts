import { z } from "zod";
import { schemaHelper } from "@/db/utils/schema-helper";
import type { Session } from "@/lib/auth-client";

export const cachedSessionUserSchema = z.object({
	id: z.string().min(1),
	name: z.string().min(1),
	email: z.string().min(1),
	role: z.string().min(1),
	emailVerified: z.boolean().optional(),
	email_verified: z.boolean().optional(),
	image: z.string().nullable().optional(),
	phoneNumber: z.string().nullable().optional(),
	banned: z.boolean().optional(),
	banReason: z.string().nullable().optional(),
	banExpires: schemaHelper.flexibleDatetime().nullish(),
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

	const emailVerified =
		user.emailVerified === true || user.email_verified === true;
	const { execute } = await import("@/lib/local-db");
	const now = Math.floor(Date.now() / 1000);
	await execute(
		`INSERT OR IGNORE INTO user
      (id, name, email, email_verified, image, phone_number, created_at, updated_at, role, banned, ban_reason, ban_expires)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
		[
			user.id,
			user.name,
			user.email,
			emailVerified ? 1 : 0,
			user.image ?? null,
			user.phoneNumber ?? null,
			now,
			now,
			user.role,
			user.banned ? 1 : 0,
			user.banReason ?? null,
			user.banExpires ? Math.floor(user.banExpires.getTime() / 1000) : null,
		],
	);

	return user.id;
}
