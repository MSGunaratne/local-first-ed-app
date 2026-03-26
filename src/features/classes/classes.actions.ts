import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
	idInputSchema,
	updateByIdInputSchema,
} from "@/lib/commonServerFnSchema";
import {
	dataTableListInputSchema,
	normalizeDataTableListInput,
} from "@/lib/dataTableSearchSchema";
import { idempotentMiddleware } from "@/lib/server-fn";
import { classInsertSchema } from "./classes.schema";
import {
	createClass,
	deleteClass,
	getClassById,
	getClasses,
	updateClass,
} from "./classes.service";

const createClassInputSchema = classInsertSchema.extend({
	idempotencyKey: z.string().optional(),
});

export const getClassesFn = createServerFn({ method: "GET" })
	.inputValidator((data) => dataTableListInputSchema.parse(data))
	.handler(async ({ data }) => {
		return getClasses(normalizeDataTableListInput(data));
	});

export const getClassByIdFn = createServerFn({ method: "GET" })
	.inputValidator((data) => idInputSchema.parse(data))
	.handler(async ({ data }) => {
		return getClassById(data.id);
	});

export const createClassFn = createServerFn({ method: "POST" })
	.middleware([idempotentMiddleware])
	.inputValidator((data) => createClassInputSchema.parse(data))
	.handler(async ({ data }) => {
		const { idempotencyKey: _key, ...classData } = data;
		return createClass(classData);
	});

export const updateClassFn = createServerFn({ method: "POST" })
	.middleware([idempotentMiddleware])
	.inputValidator((data) =>
		updateByIdInputSchema(classInsertSchema.partial()).parse(data),
	)
	.handler(async ({ data }) => {
		return updateClass(data.id, data.data);
	});

export const deleteClassFn = createServerFn({ method: "POST" })
	.middleware([idempotentMiddleware])
	.inputValidator((data) => idInputSchema.parse(data))
	.handler(async ({ data }) => {
		return deleteClass(data.id);
	});
