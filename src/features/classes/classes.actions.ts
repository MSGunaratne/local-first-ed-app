import { createServerFn } from "@tanstack/react-start";
import {
	idInputSchema,
	updateByIdInputSchema,
} from "@/lib/commonServerFnSchema";
import {
	dataTableListInputSchema,
	normalizeDataTableListInput,
} from "@/lib/dataTableSearchSchema";
import { classInsertSchema } from "./classes.schema";
import {
	createClass,
	deleteClass,
	getClassById,
	getClasses,
	updateClass,
} from "./classes.service";

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
	.inputValidator((data) => classInsertSchema.parse(data))
	.handler(async ({ data }) => {
		return createClass(data);
	});

export const updateClassFn = createServerFn({ method: "POST" })
	.inputValidator((data) =>
		updateByIdInputSchema(classInsertSchema.partial()).parse(data),
	)
	.handler(async ({ data }) => {
		return updateClass(data.id, data.data);
	});

export const deleteClassFn = createServerFn({ method: "POST" })
	.inputValidator((data) => idInputSchema.parse(data))
	.handler(async ({ data }) => {
		return deleteClass(data.id);
	});
