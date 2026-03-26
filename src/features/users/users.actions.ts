import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
	idInputSchema,
	updateByIdInputSchema,
} from "@/lib/commonServerFnSchema";
import {
	dataTableExportInputSchema,
	dataTableListInputSchema,
	normalizeDataTableExportInput,
	normalizeDataTableListInput,
} from "@/lib/dataTableSearchSchema";
import { baseMiddleware, idempotentMiddleware } from "@/lib/server-fn";
import { userCreateClientSchema, userUpdateClientSchema } from "./users.schema";
import {
	createUser,
	deleteUser,
	exportUsers,
	getUserById,
	getUsers,
	updateUser,
} from "./users.service";

// ----------------------------------------------------------------------

const createUserInputSchema = userCreateClientSchema.extend({
	idempotencyKey: z.string().optional(),
});
const updateUserInputSchema = userUpdateClientSchema.extend({
	idempotencyKey: z.string().optional(),
});

// ----------------------------------------------------------------------

export const getUsersFn = createServerFn({ method: "GET" })
	.middleware([baseMiddleware])
	.inputValidator((data) => dataTableListInputSchema.parse(data))
	.handler(async ({ data, context }) => {
		return getUsers(normalizeDataTableListInput(data), context.signal);
	});

export const exportUsersFn = createServerFn({ method: "GET" })
	.inputValidator((data) => dataTableExportInputSchema.parse(data))
	.handler(async ({ data }) => {
		return exportUsers(normalizeDataTableExportInput(data));
	});

export const getUserByIdFn = createServerFn({ method: "GET" })
	.inputValidator((data) => idInputSchema.parse(data))
	.handler(async ({ data }) => {
		return getUserById(data.id);
	});

export const createUserFn = createServerFn({ method: "POST" })
	.middleware([idempotentMiddleware])
	.inputValidator((data) => createUserInputSchema.parse(data))
	.handler(async ({ data }) => {
		const { idempotencyKey: _key, ...userData } = data;
		return createUser(userData);
	});

export const updateUserFn = createServerFn({ method: "POST" })
	.middleware([idempotentMiddleware])
	.inputValidator((data) =>
		updateByIdInputSchema(updateUserInputSchema).parse(data),
	)
	.handler(async ({ data }) => {
		const { idempotencyKey: _key, ...userData } = data.data;
		return updateUser(data.id, userData);
	});

export const deleteUserFn = createServerFn({ method: "POST" })
	.middleware([idempotentMiddleware])
	.inputValidator((data) => idInputSchema.parse(data))
	.handler(async ({ data }) => {
		return deleteUser(data.id);
	});
