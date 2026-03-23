import type { QueryClient } from "@tanstack/react-query";
import { isRedirect, redirect } from "@tanstack/react-router";
import { authQueries } from "#/features/auth/auth.queries";

interface RequireAuthenticatedRouteParams {
	queryClient: QueryClient;
	locationHref: string;
}

export async function requireAuthenticatedRoute({
	queryClient,
	locationHref,
}: RequireAuthenticatedRouteParams) {
	try {
		const session = await queryClient.ensureQueryData(authQueries.session());

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
