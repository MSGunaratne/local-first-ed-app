import { type ZodType, z } from "zod";

export const idInputSchema = z.object({
	id: z.string(),
});

export function updateByIdInputSchema<T extends ZodType>(dataSchema: T) {
	return z.object({
		id: z.string(),
		data: dataSchema,
	});
}
