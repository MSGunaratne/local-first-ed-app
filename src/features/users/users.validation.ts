import { z } from "zod";
import { schemaHelper } from "@/db/utils/schema-helper";

export const userUpdateClientSchema = z.object({
	name: z.string().min(1, "Name is required").trim(),
	email: z.email(),
	phoneNumber: schemaHelper.phoneNumberNullable(),
	image: schemaHelper.file({ message: "Avatar is required!" }).nullable(),
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
		image: data.image instanceof File ? null : data.image,
	}),
);

export const userCreateServerSchema = userCreateClientSchema.transform(
	(data) => ({
		...data,
		image: data.image instanceof File ? null : data.image,
	}),
);
