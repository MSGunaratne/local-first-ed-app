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
	restoreClass,
	updateClass,
} from "./classes.service";

const createClassInputSchema = classInsertSchema.extend({
	id: z.uuid().optional(),
	idempotencyKey: z.string().optional(),
});

export const getClassesFn = createServerFn({ method: "GET" })
	.validator((data) => dataTableListInputSchema.parse(data))
	.handler(async ({ data }) => {
		return getClasses(normalizeDataTableListInput(data));
	});

export const getClassByIdFn = createServerFn({ method: "GET" })
	.validator((data) => idInputSchema.parse(data))
	.handler(async ({ data }) => {
		return getClassById(data.id);
	});

export const createClassFn = createServerFn({ method: "POST" })
	.middleware([idempotentMiddleware])
	.validator((data) => createClassInputSchema.parse(data))
	.handler(async ({ data }) => {
		const { idempotencyKey: _key, ...classData } = data;
		return createClass(classData);
	});

export const updateClassFn = createServerFn({ method: "POST" })
	.middleware([idempotentMiddleware])
	.validator((data) =>
		updateByIdInputSchema(classInsertSchema.partial()).parse(data),
	)
	.handler(async ({ data }) => {
		return updateClass(data.id, data.data, data.expectedRevision);
	});

export const deleteClassFn = createServerFn({ method: "POST" })
	.middleware([idempotentMiddleware])
	.validator((data) => idInputSchema.parse(data))
	.handler(async ({ data }) => {
		return deleteClass(data.id, data.expectedRevision);
	});

export const restoreClassFn = createServerFn({ method: "POST" })
	.middleware([idempotentMiddleware])
	.validator((data) => updateByIdInputSchema(classInsertSchema).parse(data))
	.handler(async ({ data }) => {
		return restoreClass(data.id, data.data, data.expectedRevision);
	});
