import { createMiddleware } from "@tanstack/react-start";
import { checkIdempotencyKey, recordIdempotencyKey } from "@/lib/idempotency";

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

/**
 * Idempotency middleware for mutation server functions.
 * Reads an `idempotencyKey` from the input data and deduplicates requests.
 */
export const idempotentMiddleware = createMiddleware().server(
	async ({ next, request }) => {
		throwIfAborted(request.signal);

		// Extract idempotency key from the request body if present.
		// Clone the request so the body can still be read downstream.
		let idempotencyKey: string | undefined;
		try {
			const cloned = request.clone();
			const body = await cloned.text();
			if (body) {
				const parsed = JSON.parse(body) as Record<string, unknown>;
				if (typeof parsed.idempotencyKey === "string") {
					idempotencyKey = parsed.idempotencyKey;
				}
			}
		} catch {
			// If parsing fails, just skip idempotency check
		}

		if (idempotencyKey) {
			const cached = await checkIdempotencyKey(idempotencyKey);
			if (cached !== undefined) {
				// This mutation was already processed — return the cached result
				return cached as never;
			}
		}

		const result = await next({
			context: {
				signal: request.signal,
			} satisfies ServerFnContext,
		});

		// Record the successful result for deduplication
		if (idempotencyKey) {
			await recordIdempotencyKey(idempotencyKey, result);
		}

		return result;
	},
);
