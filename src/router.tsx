import { createRouter as createTanStackRouter } from "@tanstack/react-router";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";
import { initializeConnectionMode } from "@/lib/connection-mode";
import { getContext } from "@/lib/query-client";
import { deLocalizeUrl, localizeUrl } from "@/paraglide/runtime";
import { routeTree } from "./routeTree.gen";

export function getRouter() {
	// Route loaders can run before React effects. Apply the stored connection
	// mode now so their Query network state is correct from the first request.
	initializeConnectionMode();
	const routerContext = getContext();
	const router = createTanStackRouter({
		routeTree,
		rewrite: {
			input: ({ url }) => deLocalizeUrl(url),
			output: ({ url }) => localizeUrl(url),
		},

		context: routerContext,

		scrollRestoration: true,
		defaultPreload: "intent",
		defaultPreloadStaleTime: 30_000,
	});
	setupRouterSsrQueryIntegration({
		router,
		queryClient: routerContext.queryClient,
		wrapQueryClient: false,
	});

	return router;
}

declare module "@tanstack/react-router" {
	interface Register {
		router: ReturnType<typeof getRouter>;
	}
}
