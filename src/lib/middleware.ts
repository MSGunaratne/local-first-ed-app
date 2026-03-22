import { redirect } from "@tanstack/react-router";
import { createMiddleware } from "@tanstack/react-start";
import {
	getRequestHeaders,
	setResponseHeader,
} from "@tanstack/react-start/server";
import { auth } from "@/lib/auth";

export const authMiddleware = createMiddleware().server(async ({ next }) => {
	const headers = getRequestHeaders();

	const { response, headers: responseHeaders } = await auth.api.getSession({
		headers,
		returnHeaders: true,
	});
	const session = response?.session;

	const setCookieHeader = responseHeaders?.get("set-cookie");
	if (setCookieHeader) {
		setResponseHeader("set-cookie", setCookieHeader);
	}

	if (!session) {
		throw redirect({
			to: "/sign-in",
			search: {
				returnTo: headers.get("x-request-url") || "/",
			},
		});
	}

	return await next({ context: { session } });
});
