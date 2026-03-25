import { createServerFn } from "@tanstack/react-start";
import {
	idInputSchema,
	updateByIdInputSchema,
} from "@/lib/commonServerFnSchema";
import {
	dataTableListInputSchema,
	normalizeDataTableListInput,
} from "@/lib/dataTableSearchSchema";
import { baseMiddleware } from "@/lib/server-fn";
import { lessonInsertSchema } from "./lessons.schema";
import {
	createLesson,
	deleteLesson,
	getLessonById,
	getLessons,
	updateLesson,
} from "./lessons.service";

export const getLessonsFn = createServerFn({ method: "GET" })
	.middleware([baseMiddleware])
	.inputValidator((data) => dataTableListInputSchema.parse(data))
	.handler(async ({ data, context }) => {
		return getLessons(normalizeDataTableListInput(data), context.signal);
	});

export const getLessonByIdFn = createServerFn({ method: "GET" })
	.inputValidator((data) => idInputSchema.parse(data))
	.handler(async ({ data }) => {
		return getLessonById(data.id);
	});

export const createLessonFn = createServerFn({ method: "POST" })
	.inputValidator((data) => lessonInsertSchema.parse(data))
	.handler(async ({ data }) => {
		return createLesson(data);
	});

export const updateLessonFn = createServerFn({ method: "POST" })
	.inputValidator((data) =>
		updateByIdInputSchema(lessonInsertSchema.partial()).parse(data),
	)
	.handler(async ({ data }) => {
		return updateLesson(data.id, data.data);
	});

export const deleteLessonFn = createServerFn({ method: "POST" })
	.inputValidator((data) => idInputSchema.parse(data))
	.handler(async ({ data }) => {
		return deleteLesson(data.id);
	});
