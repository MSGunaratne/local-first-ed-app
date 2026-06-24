import { env } from "cloudflare:workers";

const IDEMPOTENCY_TTL_SECONDS = 30 * 24 * 60 * 60;

let ensureTablePromise: Promise<void> | null = null;

async function ensureIdempotencyTable() {
	if (!ensureTablePromise) {
		ensureTablePromise = (async () => {
			await env.ed_app_db
				.prepare(
					`CREATE TABLE IF NOT EXISTS idempotency_keys (
						key TEXT PRIMARY KEY NOT NULL,
						response_body TEXT,
						created_at INTEGER NOT NULL DEFAULT (unixepoch())
					);`,
				)
				.run();

			await env.ed_app_db
				.prepare(
					"CREATE INDEX IF NOT EXISTS idx_idempotency_keys_created_at ON idempotency_keys(created_at);",
				)
				.run();
		})();
	}

	await ensureTablePromise;
}

export async function checkIdempotencyKey(
	key: string,
): Promise<unknown | undefined> {
	await ensureIdempotencyTable();

	const row = await env.ed_app_db
		.prepare(
			"SELECT response_body AS responseBody, created_at AS createdAt FROM idempotency_keys WHERE key = ? LIMIT 1;",
		)
		.bind(key)
		.first<{ responseBody: string | null; createdAt: number }>();

	if (!row) {
		return undefined;
	}

	const nowSec = Math.floor(Date.now() / 1000);
	if (nowSec - row.createdAt > IDEMPOTENCY_TTL_SECONDS) {
		await env.ed_app_db
			.prepare("DELETE FROM idempotency_keys WHERE key = ?;")
			.bind(key)
			.run();
		return undefined;
	}

	if (row.responseBody == null) {
		return null;
	}

	try {
		return JSON.parse(row.responseBody);
	} catch {
		return undefined;
	}
}

export async function recordIdempotencyKey(
	key: string,
	responseBody: unknown,
): Promise<void> {
	await ensureIdempotencyTable();

	let serialized: string | null = null;
	try {
		serialized = JSON.stringify(responseBody);
	} catch {
		serialized = null;
	}

	await env.ed_app_db
		.prepare(
			"INSERT OR IGNORE INTO idempotency_keys (key, response_body, created_at) VALUES (?, ?, unixepoch());",
		)
		.bind(key, serialized)
		.run();

	// Opportunistic cleanup to keep table bounded.
	await env.ed_app_db
		.prepare(
			"DELETE FROM idempotency_keys WHERE created_at < (unixepoch() - ?);",
		)
		.bind(IDEMPOTENCY_TTL_SECONDS)
		.run();
}
