import { type InferSelectModel, sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { uuidv7 } from "uuidv7";
import { z } from "zod";

import { schemaHelper } from "@/db/utils/schema-helper";
import { Role } from "@/types/user";

export const users = sqliteTable("user", {
	id: text("id")
		.primaryKey()
		.$defaultFn(() => uuidv7()),
	name: text("name").notNull(),
	email: text("email").notNull().unique(),
	emailVerified: integer("email_verified", { mode: "boolean" })
		.notNull()
		.default(false),
	image: text("image"),
	phoneNumber: text("phone_number").unique(),
	createdAt: integer("created_at", { mode: "timestamp" })
		.notNull()
		.default(sql`(unixepoch())`),
	updatedAt: integer("updated_at", { mode: "timestamp" })
		.notNull()
		.default(sql`(unixepoch())`)
		.$onUpdate(() => new Date()),
	role: text("role", {
		enum: [Role.SUPER_ADMIN, Role.ADMIN, Role.TEACHER, Role.STUDENT],
	}).notNull(),
	banned: integer("banned", { mode: "boolean" }).default(false),
	banReason: text("ban_reason"),
	banExpires: integer("ban_expires", { mode: "timestamp" }),
});

export type User = InferSelectModel<typeof users>;

export const sessions = sqliteTable("session", {
	id: text("id")
		.primaryKey()
		.$defaultFn(() => uuidv7()),
	expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
	token: text("token").notNull().unique(),
	createdAt: integer("created_at", { mode: "timestamp" })
		.notNull()
		.default(sql`(unixepoch())`),
	updatedAt: integer("updated_at", { mode: "timestamp" })
		.notNull()
		.default(sql`(unixepoch())`)
		.$onUpdate(() => new Date()),
	ipAddress: text("ip_address"),
	userAgent: text("user_agent"),
	userId: text("user_id")
		.notNull()
		.references(() => users.id, { onDelete: "cascade" }),
	impersonatedBy: text("impersonated_by"),
});

export type Session = InferSelectModel<typeof sessions>;

export const accounts = sqliteTable("account", {
	id: text("id")
		.primaryKey()
		.$defaultFn(() => uuidv7()),
	accountId: text("account_id").notNull(),
	providerId: text("provider_id").notNull(),
	userId: text("user_id")
		.notNull()
		.references(() => users.id, { onDelete: "cascade" }),
	accessToken: text("access_token"),
	refreshToken: text("refresh_token"),
	idToken: text("id_token"),
	accessTokenExpiresAt: integer("access_token_expires_at", {
		mode: "timestamp",
	}),
	refreshTokenExpiresAt: integer("refresh_token_expires_at", {
		mode: "timestamp",
	}),
	scope: text("scope"),
	password: text("password"),
	createdAt: integer("created_at", { mode: "timestamp" })
		.notNull()
		.default(sql`(unixepoch())`),
	updatedAt: integer("updated_at", { mode: "timestamp" })
		.notNull()
		.default(sql`(unixepoch())`)
		.$onUpdate(() => new Date()),
});

export type Account = InferSelectModel<typeof accounts>;

export const verifications = sqliteTable("verification", {
	id: text("id")
		.primaryKey()
		.$defaultFn(() => uuidv7()),
	identifier: text("identifier").notNull(),
	value: text("value").notNull(),
	expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
	createdAt: integer("created_at", { mode: "timestamp" }).default(
		sql`(unixepoch())`,
	),
	updatedAt: integer("updated_at", { mode: "timestamp" })
		.default(sql`(unixepoch())`)
		.$onUpdate(() => new Date()),
});

export type Verification = InferSelectModel<typeof verifications>;

export const userUpdateClientSchema = createInsertSchema(users, {
	name: (sch) => sch.min(1, "Name is required").trim(),
	email: z.email(),
	phoneNumber: schemaHelper.phoneNumberNullable(),
	image: schemaHelper.file({ message: "Avatar is required!" }).nullable(),
}).omit({
	id: true,
	role: true,
	emailVerified: true,
	banExpires: true,
	banned: true,
	banReason: true,
	createdAt: true,
	updatedAt: true,
});

export type UserUpdateInput = z.infer<typeof userUpdateClientSchema>;

export const userCreateClientSchema = userUpdateClientSchema.extend({
	password: z
		.string()
		.min(8, "Password must be at least 8 characters!")
		.max(255, "Password must be at most 255 characters!")
		.regex(/[a-z]/, "Must include 1 lowercase letter")
		.regex(/[A-Z]/, "Must include 1 uppercase letter")
		.regex(/\d/, "Must include 1 number")
		.regex(/[!@#$%^&*(),.?":{}|<>]/, "Must include 1 symbol"),
});
export type UserCreateInput = z.infer<typeof userCreateClientSchema>;

export const userUpdateServerSchema = userUpdateClientSchema.transform(
	(data) => ({
		...data,
		// TODO: Implement file upload logic here
		image: data.image instanceof File ? null : data.image,
	}),
);

export const userCreateServerSchema = userCreateClientSchema.transform(
	(data) => ({
		...data,
		// TODO: Implement file upload logic here
		image: data.image instanceof File ? null : data.image,
	}),
);
