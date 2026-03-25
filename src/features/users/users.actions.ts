import { createServerFn } from "@tanstack/react-start";
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
import { baseMiddleware } from "@/lib/server-fn";
import { userCreateClientSchema, userUpdateClientSchema } from "./users.schema";
import {
	createUser,
	deleteUser,
	exportUsers,
	getUserById,
	getUsers,
	updateUser,
} from "./users.service";

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
	.inputValidator((data) => userCreateClientSchema.parse(data))
	.handler(async ({ data }) => {
		return createUser(data);
	});

export const updateUserFn = createServerFn({ method: "POST" })
	.inputValidator((data) =>
		updateByIdInputSchema(userUpdateClientSchema).parse(data),
	)
	.handler(async ({ data }) => {
		return updateUser(data.id, data.data);
	});

export const deleteUserFn = createServerFn({ method: "POST" })
	.inputValidator((data) => idInputSchema.parse(data))
	.handler(async ({ data }) => {
		return deleteUser(data.id);
	});
