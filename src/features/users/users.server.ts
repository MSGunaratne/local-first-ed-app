import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { userCreateClientSchema, userUpdateClientSchema } from "./users.schema";
import {
	createUser,
	deleteUser,
	exportUsers,
	getUserById,
	getUsers,
	updateUser,
} from "./users.service";

const usersSearchParamsSchema = z.object({
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

export const getUsersFn = createServerFn({ method: "GET" })
	.inputValidator((data: unknown) => usersSearchParamsSchema.parse(data))
	.handler(async ({ data }) => {
		const result = await getUsers({
			pagination: data.pagination,
			sorting: data.sorting ?? [],
			columnFilters: data.columnFilters ?? [],
			globalFilter: data.globalFilter ?? "",
		});
		return result;
	});

const usersExportParamsSchema = z.object({
	sorting: z.array(z.object({ id: z.string(), desc: z.boolean() })).optional(),
	columnFilters: z
		.array(z.object({ id: z.string(), value: z.unknown() }))
		.optional(),
	globalFilter: z.string().optional(),
});

export const exportUsersFn = createServerFn({ method: "GET" })
	.inputValidator((data: unknown) => usersExportParamsSchema.parse(data))
	.handler(async ({ data }) => {
		return exportUsers({
			sorting: data.sorting ?? [],
			columnFilters: data.columnFilters ?? [],
			globalFilter: data.globalFilter ?? "",
		});
	});

export const getUserByIdFn = createServerFn({ method: "GET" })
	.inputValidator((data: unknown) => z.object({ id: z.string() }).parse(data))
	.handler(async ({ data }) => {
		return getUserById(data.id);
	});

export const createUserFn = createServerFn({ method: "POST" })
	.inputValidator((data: unknown) => userCreateClientSchema.parse(data))
	.handler(async ({ data }) => {
		return createUser(data);
	});

export const updateUserFn = createServerFn({ method: "POST" })
	.inputValidator((data: unknown) =>
		z
			.object({
				id: z.string(),
				data: userUpdateClientSchema,
			})
			.parse(data),
	)
	.handler(async ({ data }) => {
		return updateUser(data.id, data.data);
	});

export const deleteUserFn = createServerFn({ method: "POST" })
	.inputValidator((data: unknown) => z.object({ id: z.string() }).parse(data))
	.handler(async ({ data }) => {
		return deleteUser(data.id);
	});
