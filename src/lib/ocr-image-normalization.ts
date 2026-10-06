function histogramPercentile(
	histogram: Uint32Array,
	pixelCount: number,
	percentile: number,
) {
	const target = pixelCount * percentile;
	let seen = 0;
	for (let value = 0; value < histogram.length; value += 1) {
		seen += histogram[value];
		if (seen >= target) return value;
	}
	return 255;
}

export interface OcrBoundingBox {
	x0: number;
	y0: number;
	x1: number;
	y1: number;
}

export interface OcrImageRegionMap {
	width: number;
	height: number;
	columns: number;
	rows: number;
	tiles: Array<{
		saturatedFraction: number;
		darkFraction: number;
		edgeFraction: number;
	}>;
}

export interface OcrRegionStats {
	saturatedFraction: number;
	darkFraction: number;
	edgeFraction: number;
}

/**
 * Builds a tiny colour/texture map before OCR normalization. Keeping a grid
 * instead of the full RGBA buffer makes illustration filtering cheap on phones.
 */
export function buildOcrImageRegionMap(
	data: Uint8ClampedArray,
	width: number,
	height: number,
	tileSize = 64,
): OcrImageRegionMap {
	const columns = Math.ceil(width / tileSize);
	const rows = Math.ceil(height / tileSize);
	const totals = Array.from({ length: columns * rows }, () => ({
		pixels: 0,
		saturated: 0,
		dark: 0,
		edges: 0,
	}));

	for (let y = 0; y < height; y += 2) {
		for (let x = 0; x < width; x += 2) {
			const index = (y * width + x) * 4;
			const r = data[index];
			const g = data[index + 1];
			const b = data[index + 2];
			const maximum = Math.max(r, g, b);
			const minimum = Math.min(r, g, b);
			const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
			const tile =
				totals[Math.floor(y / tileSize) * columns + Math.floor(x / tileSize)];
			tile.pixels += 1;
			if (maximum > 60 && (maximum - minimum) / maximum > 0.18)
				tile.saturated += 1;
			if (luminance < 185) tile.dark += 1;

			if (x >= 2) {
				const previous = index - 8;
				const previousLuminance =
					0.299 * data[previous] +
					0.587 * data[previous + 1] +
					0.114 * data[previous + 2];
				if (Math.abs(luminance - previousLuminance) > 42) tile.edges += 1;
			}
		}
	}

	return {
		width,
		height,
		columns,
		rows,
		tiles: totals.map((tile) => ({
			saturatedFraction: tile.pixels ? tile.saturated / tile.pixels : 0,
			darkFraction: tile.pixels ? tile.dark / tile.pixels : 0,
			edgeFraction: tile.pixels ? tile.edges / tile.pixels : 0,
		})),
	};
}

export function getOcrRegionStats(
	map: OcrImageRegionMap | null | undefined,
	bbox: OcrBoundingBox | null | undefined,
): OcrRegionStats | undefined {
	if (!map || !bbox) return undefined;
	const x0 = Math.max(
		0,
		Math.min(map.columns - 1, Math.floor((bbox.x0 / map.width) * map.columns)),
	);
	const x1 = Math.max(
		x0,
		Math.min(map.columns - 1, Math.floor((bbox.x1 / map.width) * map.columns)),
	);
	const y0 = Math.max(
		0,
		Math.min(map.rows - 1, Math.floor((bbox.y0 / map.height) * map.rows)),
	);
	const y1 = Math.max(
		y0,
		Math.min(map.rows - 1, Math.floor((bbox.y1 / map.height) * map.rows)),
	);
	let count = 0;
	let saturatedFraction = 0;
	let darkFraction = 0;
	let edgeFraction = 0;
	for (let y = y0; y <= y1; y += 1) {
		for (let x = x0; x <= x1; x += 1) {
			const tile = map.tiles[y * map.columns + x];
			count += 1;
			saturatedFraction += tile.saturatedFraction;
			darkFraction += tile.darkFraction;
			edgeFraction += tile.edgeFraction;
		}
	}
	return {
		saturatedFraction: saturatedFraction / count,
		darkFraction: darkFraction / count,
		edgeFraction: edgeFraction / count,
	};
}

/** Mutates browser ImageData pixels into adaptive grayscale for OCR. */
export function normalizeOcrImagePixels(
	data: Uint8ClampedArray,
	strengthPercent = 80,
) {
	const histogram = new Uint32Array(256);
	const pixelCount = data.length / 4;
	for (let index = 0; index < data.length; index += 4) {
		const gray = Math.round(
			0.299 * data[index] + 0.587 * data[index + 1] + 0.114 * data[index + 2],
		);
		histogram[gray] += 1;
	}

	const blackPoint = histogramPercentile(histogram, pixelCount, 0.02);
	const whitePoint = histogramPercentile(histogram, pixelCount, 0.98);
	const measuredRange = whitePoint - blackPoint;
	const tonalRange = Math.max(32, measuredRange);
	// Sparse pages can have identical percentile endpoints. In that case,
	// grayscale is safer than stretching a white background toward black.
	const normalizationStrength =
		measuredRange >= 24 ? Math.max(0, Math.min(1, strengthPercent / 100)) : 0;

	for (let index = 0; index < data.length; index += 4) {
		const gray =
			0.299 * data[index] + 0.587 * data[index + 1] + 0.114 * data[index + 2];
		const normalized = ((gray - blackPoint) * 255) / tonalRange;
		const output = Math.max(
			0,
			Math.min(
				255,
				gray * (1 - normalizationStrength) + normalized * normalizationStrength,
			),
		);

		data[index] = output;
		data[index + 1] = output;
		data[index + 2] = output;
	}
}
