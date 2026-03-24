import {
	getRequestHeaders,
	setResponseHeaders,
} from "@tanstack/react-start/server";
import { AuthorizationError } from "@/db/utils/errors";

export async function readServerSession() {
	const headers = await getRequestHeaders();
	const { auth } = await import("@/lib/auth");

	const betterAuthUrl = process.env.BETTER_AUTH_URL;
	if (!betterAuthUrl) {
		throw new Error("BETTER_AUTH_URL is required for auth configuration");
	}

	const url = `${betterAuthUrl}/api/auth/get-session`;
	const req = new Request(url, { headers });
	const response = await auth.handler(req);

	// Forward Set-Cookie headers
	const setCookies = response.headers.getSetCookie();
	if (setCookies.length > 0) {
		const resHeaders = new Headers();
		for (const cookie of setCookies) {
			resHeaders.append("Set-Cookie", cookie);
		}
		setResponseHeaders(resHeaders);
	}

	if (!response.ok) {
		return null;
	}

	return await response.json();
}

export async function requireServerSession(message = "You must be logged in") {
	const session = await readServerSession();

	if (!session) {
		throw new AuthorizationError(message);
	}

	return session;
}
