export type HistogramChannel = 'red' | 'green' | 'blue' | 'luma';
export type Histogram = Record<HistogramChannel, number[]> & { pixels: number; shadows: number; highlights: number };

/** Display-referred histogram of sampled RGBA preview pixels, excluding transparency. */
export function calculateHistogram(rgba: Uint8ClampedArray): Histogram {
	const result: Histogram = {
		red: Array(256).fill(0),
		green: Array(256).fill(0),
		blue: Array(256).fill(0),
		luma: Array(256).fill(0),
		pixels: 0,
		shadows: 0,
		highlights: 0
	};
	for (let i = 0; i + 3 < rgba.length; i += 4) {
		if (rgba[i + 3] === 0) continue;
		const r = rgba[i],
			g = rgba[i + 1],
			b = rgba[i + 2];
		result.red[r]++;
		result.green[g]++;
		result.blue[b]++;
		result.luma[Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b)]++;
		result.pixels++;
		if (Math.min(r, g, b) === 0) result.shadows++;
		if (Math.max(r, g, b) === 255) result.highlights++;
	}
	return result;
}
