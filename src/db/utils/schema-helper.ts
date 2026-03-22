import type { ZodType } from "zod";

import { z } from "zod";
import { isValidPhoneNumber } from "react-phone-number-input/input";

// ----------------------------------------------------------------------

type MessageMapProps = {
	required?: string;
	invalid_type?: string;
};

export const schemaHelper = {
	/**
	 * Apply for phone number input where phone number is required.
	 * Returns `string` type - validation fails if empty.
	 */
	phoneNumber: (props?: { message?: MessageMapProps }) =>
		z
			.string()
			.trim()
			.min(1, props?.message?.required ?? "Phone number is required!")
			.refine(
				(val) => isValidPhoneNumber(val),
				props?.message?.invalid_type ?? "Invalid phone number format!",
			),

	/**
	 * Apply for phone number input where phone number is optional.
	 * Returns `string | null` type - allows empty/null values.
	 */
	phoneNumberNullable: (props?: { message?: MessageMapProps }) =>
		z
			.string()
			.trim()
			.transform((val) => (val === "" ? null : val))
			.nullable()
			.refine(
				(val): val is string | null => val === null || isValidPhoneNumber(val),
				props?.message?.invalid_type ?? "Invalid phone number format!",
			),

	/**
	 * Editor
	 * defaultValue === '' | <p></p>
	 * Apply for editor
	 */
	editor: (props?: { message: string }) =>
		z.string().min(8, props?.message ?? "Content is required!"),

	/**
	 * Nullable Input (as a required field)
	 * Enforces that a nullable field is not null. Useful for UI components
	 * that return null for empty required fields.
	 */
	nullableInput: <T extends ZodType>(schema: T, options?: { error?: string }) =>
		schema.nullable().transform((val, ctx) => {
			if (val === null || val === undefined) {
				ctx.addIssue({
					code: "custom",
					message: options?.error ?? "Field cannot be empty!",
				});
				return z.NEVER;
			}
			return val;
		}),

	/**
	 * Empty as Null
	 * Transforms empty string to null using a bidirectional codec.
	 * Can be encoded back: null becomes empty string.
	 */
	emptyAsNull: () =>
		z.codec(z.string().nullable(), z.string().nullable(), {
			decode: (val) => {
				if (val === null) return null;
				const trimmed = val.trim();
				return trimmed === "" ? null : trimmed;
			},
			encode: (val) => val ?? "",
		}),

	/**
	 * Nullable Number from String
	 * Preprocesses empty/null/undefined values to null before number validation.
	 * Returns `number | null` type.
	 */
	nullableNumber: (options?: {
		int?: string;
		min?: { value: number; error: string };
		max?: { value: number; error: string };
		positive?: string;
		nonnegative?: string;
	}) => {
		let schema = z.coerce.number();

		if (options?.int) schema = schema.int(options.int);
		if (options?.positive) schema = schema.positive(options.positive);
		if (options?.nonnegative) schema = schema.nonnegative(options.nonnegative);
		if (options?.min) schema = schema.min(options.min.value, options.min.error);
		if (options?.max) schema = schema.max(options.max.value, options.max.error);

		return z.preprocess(
			(val) => (val === "" || val === null || val === undefined ? null : val),
			schema.nullable(),
		);
	},

	/**
	 * Flexible Datetime
	 * Accepts Date objects, ISO strings, or timestamps and normalizes to Date.
	 * This is useful for form inputs where the value might come as various types.
	 * Use `.nullable()` if the field is optional.
	 */
	flexibleDatetime: () =>
		z.union([z.date(), z.string(), z.number()]).transform((val, ctx) => {
			if (val instanceof Date) return val;
			const date = new Date(val);
			if (Number.isNaN(date.getTime())) {
				ctx.issues.push({
					code: "custom",
					message: "Invalid date",
					input: val,
				});
				return z.NEVER;
			}
			return date;
		}),

	/**
	 * File
	 * Supports both File objects and string URLs/keys.
	 * Note: MIME type and size validation are handled by the dropzone component.
	 */
	file: (props?: { message?: string }) =>
		z.union([z.file(), z.string().min(1)], {
			error: props?.message ?? "File is required!",
		}),

	/**
	 * Files
	 * Apply for upload multiple files.
	 */
	files: (props?: { message?: string; minFiles?: number }) => {
		const minFiles = props?.minFiles ?? 1;
		const message =
			props?.message ??
			(minFiles > 1
				? `At least ${minFiles} files are required!`
				: "At least one file is required!");

		return z.array(z.union([z.file(), z.string()])).min(minFiles, message);
	},
};
