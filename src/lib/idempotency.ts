/**
 * Server-side idempotency key cache.
 *
 * For now uses an in-memory Map with TTL. This means:
 * - Keys are lost on Worker cold start
 * - Duplicate detection works within a single Worker instance lifetime
 *
 * TODO : replace with a D1 `idempotency_keys` table for durability.
 */

// TTL: 24 hours (matches Workbox bgSync maxRetentionTime)
const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

interface IdempotencyEntry {
	createdAt: number;
	responseBody: unknown;
}

const cache = new Map<string, IdempotencyEntry>();

/**
 * Check if a mutation with this idempotency key has already been processed.
 * Returns the cached response body if it has, or `undefined` if it hasn't.
 */
export function checkIdempotencyKey(key: string): unknown | undefined {
	const entry = cache.get(key);
	if (!entry) {
		return undefined;
	}

	if (Date.now() - entry.createdAt > IDEMPOTENCY_TTL_MS) {
		cache.delete(key);
		return undefined;
	}

	return entry.responseBody;
}

/**
 * Record that a mutation with this idempotency key has been processed.
 */
export function recordIdempotencyKey(key: string, responseBody: unknown): void {
	// Opportunistic cleanup of expired entries
	if (cache.size > 100) {
		const now = Date.now();
		for (const [k, v] of cache) {
			if (now - v.createdAt > IDEMPOTENCY_TTL_MS) {
				cache.delete(k);
			}
		}
	}

	cache.set(key, {
		createdAt: Date.now(),
		responseBody,
	});
}
