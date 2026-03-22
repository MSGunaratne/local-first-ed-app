import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { classInsertSchema } from "./classes.schema";
import {
	createClass,
	deleteClass,
	getClassById,
	getClasses,
	updateClass,
} from "./classes.service";

const classesSearchParamsSchema = z.object({
	pagination: z.object({
		pageIndex: z.number().default(0),
		pageSize: z.number().default(10),
	}),
	sorting: z
		.array(
			z.object({
				id: z.string(),
				desc: z.boolean(),
			}),
		)
		.optional(),
	columnFilters: z
		.array(
			z.object({
				id: z.string(),
				value: z.unknown(),
			}),
		)
		.optional(),
	globalFilter: z.string().optional(),
});

export const getClassesFn = createServerFn({ method: "GET" })
	.inputValidator((data: unknown) => classesSearchParamsSchema.parse(data))
	.handler(async ({ data }) => {
		return getClasses({
			pagination: data.pagination,
			sorting: data.sorting ?? [],
			columnFilters: data.columnFilters ?? [],
			globalFilter: data.globalFilter ?? "",
		});
	});

export const getClassByIdFn = createServerFn({ method: "GET" })
	.inputValidator((data: unknown) => z.object({ id: z.string() }).parse(data))
	.handler(async ({ data }) => {
		return getClassById(data.id);
	});

export const createClassFn = createServerFn({ method: "POST" })
	.inputValidator((data: unknown) => classInsertSchema.parse(data))
	.handler(async ({ data }) => {
		return createClass(data);
	});

export const updateClassFn = createServerFn({ method: "POST" })
	.inputValidator((data: unknown) =>
		z
			.object({
				id: z.string(),
				data: classInsertSchema.partial(),
			})
			.parse(data),
	)
	.handler(async ({ data }) => {
		return updateClass(data.id, data.data);
	});

export const deleteClassFn = createServerFn({ method: "POST" })
	.inputValidator((data: unknown) => z.object({ id: z.string() }).parse(data))
	.handler(async ({ data }) => {
		return deleteClass(data.id);
	});
