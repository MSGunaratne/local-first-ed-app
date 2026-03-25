import { createMiddleware } from "@tanstack/react-start";

type ServerFnContext = {
	signal: AbortSignal;
};

/**
 * Throws a standard AbortError when a request is already cancelled.
 */
export function throwIfAborted(signal?: AbortSignal) {
	signal?.throwIfAborted();
}

/**
 * Base middleware for all server functions.
 * Provides a properly typed context containing the AbortSignal from the request.
 */
export const baseMiddleware = createMiddleware().server(
	async ({ next, request }) => {
		throwIfAborted(request.signal);

		return next({
			context: {
				signal: request.signal,
			} satisfies ServerFnContext,
		});
	},
);
