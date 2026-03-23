import { isRedirect, redirect } from "@tanstack/react-router";
import { getSession } from "./auth-functions";

interface RequireAuthenticatedRouteParams {
	locationHref: string;
}

export async function requireAuthenticatedRoute({
	locationHref,
}: RequireAuthenticatedRouteParams) {
	try {
		const session = await getSession();

		if (!session) {
			throw redirect({
				to: "/sign-in",
				search: { returnTo: locationHref },
			});
		}

		return session;
	} catch (error) {
		if (isRedirect(error)) {
			throw error;
		}

		throw redirect({
			to: "/sign-in",
			search: { returnTo: locationHref },
		});
	}
}
