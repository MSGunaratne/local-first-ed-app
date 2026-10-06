import { createMiddleware } from "@tanstack/react-start";
import { ConflictError } from "@/db/utils/errors";
import {
	claimIdempotencyKey,
	completeIdempotencyKey,
	hashIdempotencyRequest,
	releaseIdempotencyKey,
} from "@/lib/idempotency";

type ServerFnContext = { signal: AbortSignal };

function findIdempotencyKey(value: unknown, depth = 0): string | undefined {
	if (depth > 5 || typeof value !== "object" || value === null) return;
	if ("idempotencyKey" in value && typeof value.idempotencyKey === "string") {
		return value.idempotencyKey;
	}
	for (const nested of Object.values(value)) {
		const key = findIdempotencyKey(nested, depth + 1);
		if (key) return key;
	}
}

export function throwIfAborted(signal?: AbortSignal) {
	signal?.throwIfAborted();
}

export const baseMiddleware = createMiddleware().server(
	async ({ next, request }) => {
		throwIfAborted(request.signal);
		return next({
			context: { signal: request.signal } satisfies ServerFnContext,
		});
	},
);

export const idempotentMiddleware = createMiddleware().server(
	async ({ next, request }) => {
		throwIfAborted(request.signal);

		let idempotencyKey: string | undefined;
		let requestHash: string | undefined;
		try {
			const body = await request.clone().text();
			if (body) {
				idempotencyKey = findIdempotencyKey(JSON.parse(body));
				if (idempotencyKey) requestHash = await hashIdempotencyRequest(body);
			}
		} catch {
			// Inputs without a readable top-level key continue without deduplication.
		}

		if (idempotencyKey && requestHash) {
			const claim = await claimIdempotencyKey(idempotencyKey, requestHash);
			if (claim.status === "completed") return claim.response as never;
			if (claim.status === "in_progress") {
				throw new ConflictError(
					"This operation is already being processed. Please wait before retrying.",
				);
			}
			if (claim.status === "key_reused") {
				throw new ConflictError(
					"This idempotency key was already used for a different operation.",
				);
			}
		}

		try {
			const result = await next({
				context: { signal: request.signal } satisfies ServerFnContext,
			});
			if (idempotencyKey && requestHash) {
				await completeIdempotencyKey(idempotencyKey, requestHash, result);
			}
			return result;
		} catch (error) {
			if (idempotencyKey && requestHash) {
				await releaseIdempotencyKey(idempotencyKey, requestHash);
			}
			throw error;
		}
	},
);
