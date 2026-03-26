import { type ZodType, z } from "zod";

export const idInputSchema = z.object({
	id: z.string(),
	idempotencyKey: z.string().optional(),
});

export function updateByIdInputSchema<T extends ZodType>(dataSchema: T) {
	return z.object({
		id: z.string(),
		data: dataSchema,
		idempotencyKey: z.string().optional(),
	});
}
