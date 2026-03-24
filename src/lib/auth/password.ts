const PBKDF2_PREFIX = "pbkdf2-sha256$v1";
const DEFAULT_PBKDF2_ITERATIONS = 100_000;
const MAX_PBKDF2_ITERATIONS = 100_000;
const MIN_PBKDF2_ITERATIONS = 50_000;
const KEY_LENGTH_BYTES = 32;
const SALT_LENGTH_BYTES = 16;

const getIterations = (): number => {
	const raw = process.env.BETTER_AUTH_PBKDF2_ITERATIONS;
	if (!raw) {
		return DEFAULT_PBKDF2_ITERATIONS;
	}

	const parsed = Number.parseInt(raw, 10);
	if (!Number.isFinite(parsed) || parsed < MIN_PBKDF2_ITERATIONS) {
		return DEFAULT_PBKDF2_ITERATIONS;
	}

	return Math.min(parsed, MAX_PBKDF2_ITERATIONS);
};

const bytesToHex = (bytes: Uint8Array): string => {
	let hex = "";
	for (const byte of bytes) {
		hex += byte.toString(16).padStart(2, "0");
	}
	return hex;
};

const hexToBytes = (hex: string): Uint8Array => {
	if (hex.length % 2 !== 0) {
		throw new Error("Invalid hex payload");
	}

	const bytes = new Uint8Array(hex.length / 2);
	for (let i = 0; i < hex.length; i += 2) {
		const value = Number.parseInt(hex.slice(i, i + 2), 16);
		if (Number.isNaN(value)) {
			throw new Error("Invalid hex payload");
		}
		bytes[i / 2] = value;
	}
	return bytes;
};

const timingSafeEqual = (a: Uint8Array, b: Uint8Array): boolean => {
	if (a.length !== b.length) {
		return false;
	}

	let result = 0;
	for (let i = 0; i < a.length; i += 1) {
		result |= a[i] ^ b[i];
	}

	return result === 0;
};

const derivePbkdf2 = async (
	password: string,
	salt: Uint8Array,
	iterations: number,
): Promise<Uint8Array> => {
	const saltForCrypto = new Uint8Array(salt.length);
	saltForCrypto.set(salt);

	const material = await crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(password.normalize("NFKC")),
		{ name: "PBKDF2" },
		false,
		["deriveBits"],
	);

	const bits = await crypto.subtle.deriveBits(
		{
			name: "PBKDF2",
			hash: "SHA-256",
			salt: saltForCrypto,
			iterations,
		},
		material,
		KEY_LENGTH_BYTES * 8,
	);

	return new Uint8Array(bits);
};

export const hashPassword = async (password: string): Promise<string> => {
	const iterations = getIterations();
	const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH_BYTES));
	const key = await derivePbkdf2(password, salt, iterations);

	return `${PBKDF2_PREFIX}$${iterations}$${bytesToHex(salt)}$${bytesToHex(key)}`;
};

export const verifyPassword = async ({
	hash,
	password,
}: {
	hash: string;
	password: string;
}): Promise<boolean> => {
	if (!hash.startsWith(`${PBKDF2_PREFIX}$`)) {
		return false;
	}

	const parts = hash.split("$");
	if (parts.length !== 4) {
		return false;
	}

	const [, iterationsRaw, saltHex, keyHex] = parts;
	const iterations = Number.parseInt(iterationsRaw, 10);
	if (
		!Number.isFinite(iterations) ||
		iterations < 1 ||
		iterations > MAX_PBKDF2_ITERATIONS
	) {
		return false;
	}

	try {
		const salt = hexToBytes(saltHex);
		const expected = hexToBytes(keyHex);
		const actual = await derivePbkdf2(password, salt, iterations);
		return timingSafeEqual(expected, actual);
	} catch {
		return false;
	}
};
