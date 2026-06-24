const LOCAL_ENCRYPTION_KEY_STORAGE = "local-first-ed:analytics-key:v1";

type EncryptedPayloadEnvelope = {
	__localFirstEncrypted: true;
	v: 1;
	alg: "AES-GCM";
	iv: string;
	data: string;
};

let memoryKeyJwk: JsonWebKey | null = null;
let importedKeyPromise: Promise<CryptoKey> | null = null;

function getStorage() {
	return typeof globalThis.localStorage !== "undefined"
		? globalThis.localStorage
		: null;
}

function bytesToBase64(bytes: Uint8Array): string {
	let binary = "";
	for (const byte of bytes) {
		binary += String.fromCharCode(byte);
	}
	return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
	const binary = atob(value);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) {
		bytes[i] = binary.charCodeAt(i);
	}
	return bytes;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
	return bytes.buffer.slice(
		bytes.byteOffset,
		bytes.byteOffset + bytes.byteLength,
	) as ArrayBuffer;
}

function isEnvelope(value: unknown): value is EncryptedPayloadEnvelope {
	return (
		typeof value === "object" &&
		value !== null &&
		(value as Partial<EncryptedPayloadEnvelope>).__localFirstEncrypted ===
			true &&
		(value as Partial<EncryptedPayloadEnvelope>).v === 1 &&
		(value as Partial<EncryptedPayloadEnvelope>).alg === "AES-GCM" &&
		typeof (value as Partial<EncryptedPayloadEnvelope>).iv === "string" &&
		typeof (value as Partial<EncryptedPayloadEnvelope>).data === "string"
	);
}

async function getOrCreateJwk(): Promise<JsonWebKey> {
	const storage = getStorage();
	const stored = storage?.getItem(LOCAL_ENCRYPTION_KEY_STORAGE);
	if (stored) {
		return JSON.parse(stored) as JsonWebKey;
	}

	if (memoryKeyJwk) {
		return memoryKeyJwk;
	}

	const key = await crypto.subtle.generateKey(
		{ name: "AES-GCM", length: 256 },
		true,
		["encrypt", "decrypt"],
	);
	const jwk = await crypto.subtle.exportKey("jwk", key);
	storage?.setItem(LOCAL_ENCRYPTION_KEY_STORAGE, JSON.stringify(jwk));
	memoryKeyJwk = jwk;
	return jwk;
}

async function getEncryptionKey(): Promise<CryptoKey> {
	importedKeyPromise ??= (async () => {
		const jwk = await getOrCreateJwk();
		return crypto.subtle.importKey("jwk", jwk, { name: "AES-GCM" }, false, [
			"encrypt",
			"decrypt",
		]);
	})();

	return importedKeyPromise;
}

export function isEncryptedPayloadJson(payloadJson: string): boolean {
	try {
		return isEnvelope(JSON.parse(payloadJson));
	} catch {
		return false;
	}
}

export async function encryptPayloadJson(value: unknown): Promise<string> {
	if (!globalThis.crypto?.subtle) {
		throw new Error("WebCrypto is required for local payload encryption");
	}

	const key = await getEncryptionKey();
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const plaintext = new TextEncoder().encode(JSON.stringify(value));
	const encrypted = await crypto.subtle.encrypt(
		{ name: "AES-GCM", iv },
		key,
		plaintext,
	);

	const envelope: EncryptedPayloadEnvelope = {
		__localFirstEncrypted: true,
		v: 1,
		alg: "AES-GCM",
		iv: bytesToBase64(iv),
		data: bytesToBase64(new Uint8Array(encrypted)),
	};

	return JSON.stringify(envelope);
}

export async function decryptPayloadJson(
	payloadJson: string,
): Promise<unknown> {
	const parsed = JSON.parse(payloadJson) as unknown;
	if (!isEnvelope(parsed)) {
		return parsed;
	}

	if (!globalThis.crypto?.subtle) {
		throw new Error("WebCrypto is required for local payload decryption");
	}

	const key = await getEncryptionKey();
	const iv = base64ToBytes(parsed.iv);
	const encrypted = base64ToBytes(parsed.data);
	const decrypted = await crypto.subtle.decrypt(
		{ name: "AES-GCM", iv: toArrayBuffer(iv) },
		key,
		toArrayBuffer(encrypted),
	);

	const plaintext = new TextDecoder().decode(decrypted);
	return JSON.parse(plaintext);
}
