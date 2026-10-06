import { env } from "cloudflare:workers";

const IDEMPOTENCY_TTL_SECONDS = 30 * 24 * 60 * 60;

type IdempotencyRow = {
	requestHash: string;
	status: "in_progress" | "completed";
	responseBody: string | null;
};

export type IdempotencyClaim =
	| { status: "acquired" }
	| { status: "completed"; response: unknown }
	| { status: "in_progress" }
	| { status: "key_reused" };

let ensureTablePromise: Promise<void> | null = null;

async function ensureIdempotencyTable() {
	ensureTablePromise ??= (async () => {
		await env.ed_app_db_v2
			.prepare(
				`CREATE TABLE IF NOT EXISTS idempotency_keys (
					key TEXT PRIMARY KEY NOT NULL,
					request_hash TEXT NOT NULL,
					status TEXT NOT NULL CHECK (status IN ('in_progress', 'completed')),
					response_body TEXT,
					created_at INTEGER NOT NULL DEFAULT (unixepoch()),
					updated_at INTEGER NOT NULL DEFAULT (unixepoch())
				);`,
			)
			.run();
		await env.ed_app_db_v2
			.prepare(
				"CREATE INDEX IF NOT EXISTS idx_idempotency_keys_created_at ON idempotency_keys(created_at);",
			)
			.run();
	})();
	await ensureTablePromise;
}

function deserializeResponse(responseBody: string | null): unknown {
	if (responseBody == null) return null;
	try {
		return JSON.parse(responseBody);
	} catch {
		return null;
	}
}

export async function hashIdempotencyRequest(body: string) {
	const digest = await crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode(body),
	);
	return Array.from(new Uint8Array(digest), (byte) =>
		byte.toString(16).padStart(2, "0"),
	).join("");
}

export async function claimIdempotencyKey(
	key: string,
	requestHash: string,
): Promise<IdempotencyClaim> {
	await ensureIdempotencyTable();
	const insertResult = await env.ed_app_db_v2
		.prepare(
			`INSERT OR IGNORE INTO idempotency_keys
				(key, request_hash, status, response_body, created_at, updated_at)
			 VALUES (?, ?, 'in_progress', NULL, unixepoch(), unixepoch());`,
		)
		.bind(key, requestHash)
		.run();
	if (insertResult.meta.changes > 0) return { status: "acquired" };

	const row = await env.ed_app_db_v2
		.prepare(
			`SELECT request_hash AS requestHash, status, response_body AS responseBody
			 FROM idempotency_keys WHERE key = ? LIMIT 1;`,
		)
		.bind(key)
		.first<IdempotencyRow>();
	if (!row) return claimIdempotencyKey(key, requestHash);
	if (
		row.requestHash !== requestHash &&
		!row.requestHash.startsWith("legacy:")
	) {
		return { status: "key_reused" };
	}
	if (row.status === "completed") {
		return {
			status: "completed",
			response: deserializeResponse(row.responseBody),
		};
	}
	return { status: "in_progress" };
}

export async function completeIdempotencyKey(
	key: string,
	requestHash: string,
	responseBody: unknown,
): Promise<void> {
	await ensureIdempotencyTable();
	let serialized: string | null = null;
	try {
		serialized = JSON.stringify(responseBody);
	} catch {
		serialized = null;
	}
	await env.ed_app_db_v2
		.prepare(
			`UPDATE idempotency_keys
			 SET status = 'completed', response_body = ?, updated_at = unixepoch()
			 WHERE key = ? AND request_hash = ? AND status = 'in_progress';`,
		)
		.bind(serialized, key, requestHash)
		.run();
	await env.ed_app_db_v2
		.prepare(
			"DELETE FROM idempotency_keys WHERE created_at < (unixepoch() - ?);",
		)
		.bind(IDEMPOTENCY_TTL_SECONDS)
		.run();
}

export async function releaseIdempotencyKey(
	key: string,
	requestHash: string,
): Promise<void> {
	await ensureIdempotencyTable();
	await env.ed_app_db_v2
		.prepare(
			`DELETE FROM idempotency_keys
			 WHERE key = ? AND request_hash = ? AND status = 'in_progress';`,
		)
		.bind(key, requestHash)
		.run();
}
