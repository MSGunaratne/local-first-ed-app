// @vitest-environment jsdom
import { webcrypto } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
	decryptPayloadJson,
	encryptPayloadJson,
	isEncryptedPayloadJson,
} from "./local-payload-encryption";

Object.defineProperty(globalThis, "crypto", {
	value: webcrypto,
	configurable: true,
});

describe("local payload encryption", () => {
	it("encrypts and decrypts JSON payloads", async () => {
		const encrypted = await encryptPayloadJson({
			lessonId: "lesson-1",
			comment: "Useful lesson",
			rating: 5,
		});

		expect(isEncryptedPayloadJson(encrypted)).toBe(true);
		expect(encrypted).not.toContain("Useful lesson");
		await expect(decryptPayloadJson(encrypted)).resolves.toEqual({
			lessonId: "lesson-1",
			comment: "Useful lesson",
			rating: 5,
		});
	});

	it("rejects tampered encrypted payloads", async () => {
		const encrypted = await encryptPayloadJson({ status: "completed" });
		const envelope = JSON.parse(encrypted) as { data: string };
		envelope.data = `${envelope.data.slice(0, -4)}AAAA`;

		await expect(
			decryptPayloadJson(JSON.stringify(envelope)),
		).rejects.toThrow();
	});
});
