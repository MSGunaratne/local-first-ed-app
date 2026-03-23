import { createServerFn } from "@tanstack/react-start";
import { readServerSession, requireServerSession } from "./session";

export const getSession = createServerFn({ method: "GET" }).handler(
	async () => {
		return readServerSession();
	},
);

export const ensureSession = createServerFn({ method: "GET" }).handler(
	async () => {
		return requireServerSession("Unauthorized");
	},
);
