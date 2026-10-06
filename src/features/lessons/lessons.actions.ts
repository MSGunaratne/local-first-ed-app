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
import { baseMiddleware, idempotentMiddleware } from "@/lib/server-fn";
import { lessonInsertSchema } from "./lessons.schema";
import {
	createLesson,
	deleteLesson,
	getLessonById,
	getLessons,
	restoreLesson,
	updateLesson,
} from "./lessons.service";

const createLessonInputSchema = lessonInsertSchema.extend({
	id: z.uuid().optional(),
	idempotencyKey: z.string().optional(),
});

export const getLessonsFn = createServerFn({ method: "GET" })
	.middleware([baseMiddleware])
	.validator((data) => dataTableListInputSchema.parse(data))
	.handler(async ({ data, context }) => {
		return getLessons(normalizeDataTableListInput(data), context.signal);
	});

export const getPublishedLessonsFn = createServerFn({ method: "GET" })
	.middleware([baseMiddleware])
	.validator((data) => dataTableListInputSchema.parse(data))
	.handler(async ({ data, context }) => {
		return getLessons(
			normalizeDataTableListInput(data),
			context.signal,
			"published",
		);
	});

export const getLessonByIdFn = createServerFn({ method: "GET" })
	.validator((data) => idInputSchema.parse(data))
	.handler(async ({ data }) => {
		return getLessonById(data.id);
	});

export const getPublishedLessonByIdFn = createServerFn({ method: "GET" })
	.validator((data) => idInputSchema.parse(data))
	.handler(async ({ data }) => {
		return getLessonById(data.id, "published");
	});

export const createLessonFn = createServerFn({ method: "POST" })
	.middleware([idempotentMiddleware])
	.validator((data) => createLessonInputSchema.parse(data))
	.handler(async ({ data }) => {
		const { idempotencyKey: _key, ...lessonData } = data;
		return createLesson(lessonData);
	});

export const updateLessonFn = createServerFn({ method: "POST" })
	.middleware([idempotentMiddleware])
	.validator((data) =>
		updateByIdInputSchema(lessonInsertSchema.partial()).parse(data),
	)
	.handler(async ({ data }) => {
		return updateLesson(data.id, data.data, data.expectedRevision);
	});

export const deleteLessonFn = createServerFn({ method: "POST" })
	.middleware([idempotentMiddleware])
	.validator((data) => idInputSchema.parse(data))
	.handler(async ({ data }) => {
		return deleteLesson(data.id, data.expectedRevision);
	});

export const restoreLessonFn = createServerFn({ method: "POST" })
	.middleware([idempotentMiddleware])
	.validator((data) => updateByIdInputSchema(lessonInsertSchema).parse(data))
	.handler(async ({ data }) => {
		return restoreLesson(data.id, data.data, data.expectedRevision);
	});
