import { getRequestHeaders } from "@tanstack/react-start/server";
import { AuthorizationError } from "@/db/utils/errors";
import { auth } from "@/lib/auth";

export async function readServerSession() {
	const headers = await getRequestHeaders();
	return auth.api.getSession({ headers });
}

export async function requireServerSession(message = "You must be logged in") {
	const session = await readServerSession();

	if (!session) {
		throw new AuthorizationError(message);
	}

	return session;
}
