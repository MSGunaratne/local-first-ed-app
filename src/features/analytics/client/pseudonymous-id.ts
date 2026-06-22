const ANALYTICS_ANON_SEED_KEY = "analytics:anon-seed";
const ANALYTICS_DAY_KEY = "analytics:day";
const ANALYTICS_ID_KEY = "analytics:daily-id";

async function sha256Hex(input: string): Promise<string> {
	const encoded = new TextEncoder().encode(input);
	const digest = await crypto.subtle.digest("SHA-256", encoded);
	const bytes = Array.from(new Uint8Array(digest));
	return bytes.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function getDailyPseudonymousActorId(): Promise<string> {
	const nowDay = new Date().toISOString().slice(0, 10);
	const storedDay = window.localStorage.getItem(ANALYTICS_DAY_KEY);
	const cachedId = window.localStorage.getItem(ANALYTICS_ID_KEY);

	if (storedDay === nowDay && cachedId) {
		return cachedId;
	}

	let seed = window.localStorage.getItem(ANALYTICS_ANON_SEED_KEY);
	if (!seed) {
		seed = crypto.randomUUID();
		window.localStorage.setItem(ANALYTICS_ANON_SEED_KEY, seed);
	}

	const rotated = await sha256Hex(`${seed}:${nowDay}`);
	window.localStorage.setItem(ANALYTICS_DAY_KEY, nowDay);
	window.localStorage.setItem(ANALYTICS_ID_KEY, rotated);

	return rotated;
}
