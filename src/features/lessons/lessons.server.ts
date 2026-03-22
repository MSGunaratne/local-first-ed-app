import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { lessonInsertSchema } from "./lessons.schema";
import {
	createLesson,
	deleteLesson,
	getLessonById,
	getLessons,
	updateLesson,
} from "./lessons.service";

const lessonsSearchParamsSchema = z.object({
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

export const getLessonsFn = createServerFn({ method: "GET" })
	.inputValidator((data: unknown) => lessonsSearchParamsSchema.parse(data))
	.handler(async ({ data }) => {
		return getLessons({
			pagination: data.pagination,
			sorting: data.sorting ?? [],
			columnFilters: data.columnFilters ?? [],
			globalFilter: data.globalFilter ?? "",
		});
	});

export const getLessonByIdFn = createServerFn({ method: "GET" })
	.inputValidator((data: unknown) => z.object({ id: z.string() }).parse(data))
	.handler(async ({ data }) => {
		return getLessonById(data.id);
	});

export const createLessonFn = createServerFn({ method: "POST" })
	.inputValidator((data: unknown) => lessonInsertSchema.parse(data))
	.handler(async ({ data }) => {
		return createLesson(data);
	});

export const updateLessonFn = createServerFn({ method: "POST" })
	.inputValidator((data: unknown) =>
		z
			.object({
				id: z.string(),
				data: lessonInsertSchema.partial(),
			})
			.parse(data),
	)
	.handler(async ({ data }) => {
		return updateLesson(data.id, data.data);
	});

export const deleteLessonFn = createServerFn({ method: "POST" })
	.inputValidator((data: unknown) => z.object({ id: z.string() }).parse(data))
	.handler(async ({ data }) => {
		return deleteLesson(data.id);
	});
