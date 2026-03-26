import { createRouter as createTanStackRouter } from "@tanstack/react-router";
import { getContext } from "@/lib/query-client";
import { deLocalizeUrl, localizeUrl } from "@/paraglide/runtime";
import { routeTree } from "./routeTree.gen";

export function getRouter() {
	const router = createTanStackRouter({
		routeTree,
		rewrite: {
			input: ({ url }) => deLocalizeUrl(url),
			output: ({ url }) => localizeUrl(url),
		},

		context: getContext(),

		scrollRestoration: true,
		defaultPreload: "intent",
		defaultPreloadStaleTime: 0,
	});

	return router;
}

declare module "@tanstack/react-router" {
	interface Register {
		router: ReturnType<typeof getRouter>;
	}
}
