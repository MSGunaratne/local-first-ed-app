import { describe, expect, it } from "vitest";
import {
	buildOcrImageRegionMap,
	getOcrRegionStats,
	normalizeOcrImagePixels,
} from "./ocr-image-normalization";

function rgba(grays: number[]) {
	return new Uint8ClampedArray(
		grays.flatMap((gray) => [gray, gray, gray, 255]),
	);
}

describe("normalizeOcrImagePixels", () => {
	it("does not darken a sparse white page when percentile range collapses", () => {
		const pixels = rgba([...Array.from({ length: 99 }, () => 255), 20]);
		normalizeOcrImagePixels(pixels);
		expect(pixels[0]).toBe(255);
		expect(pixels.at(-8)).toBe(255);
		expect(pixels.at(-4)).toBe(20);
	});

	it("stretches a shadowed page while retaining grayscale alpha", () => {
		const pixels = rgba([
			...Array.from({ length: 5 }, () => 60),
			...Array.from({ length: 90 }, () => 150),
			...Array.from({ length: 5 }, () => 210),
		]);
		normalizeOcrImagePixels(pixels, 80);
		expect(pixels[0]).toBeLessThan(20);
		expect(pixels.at(-4)).toBeGreaterThan(240);
		expect(pixels[3]).toBe(255);
	});
});

describe("OCR image region map", () => {
	it("retains compact colour evidence for illustration filtering", () => {
		const pixels = new Uint8ClampedArray([
			255, 0, 0, 255, 255, 255, 255, 255, 255, 0, 0, 255, 255, 255, 255, 255,
		]);
		const map = buildOcrImageRegionMap(pixels, 2, 2, 2);
		const stats = getOcrRegionStats(map, { x0: 0, y0: 0, x1: 2, y1: 2 });
		expect(map.tiles).toHaveLength(1);
		expect(stats?.saturatedFraction).toBeGreaterThan(0);
	});
});
