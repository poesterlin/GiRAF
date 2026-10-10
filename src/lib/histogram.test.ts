import { expect, test } from 'bun:test';
import { calculateHistogram } from './histogram';

test('histogram counts RGB endpoints and display luminance, ignoring transparent pixels', () => {
	const histogram = calculateHistogram(new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 255, 255, 0, 0, 255, 128, 128, 128, 255, 255, 255, 255, 0]));
	expect(histogram.pixels).toBe(4);
	expect(histogram.red[255]).toBe(2);
	expect(histogram.green[0]).toBe(2);
	expect(histogram.blue[128]).toBe(1);
	expect(histogram.luma[54]).toBe(1);
	expect(histogram.luma[255]).toBe(1);
	expect(histogram.shadows).toBe(2);
	expect(histogram.highlights).toBe(2);
	for (const channel of ['red', 'green', 'blue', 'luma'] as const) {
		expect(histogram[channel].reduce((sum, count) => sum + count, 0)).toBe(4);
	}
});

test('empty previews have no clipping or populated bins', () => {
	const histogram = calculateHistogram(new Uint8ClampedArray());
	expect(histogram.pixels).toBe(0);
	expect(histogram.shadows).toBe(0);
	expect(histogram.highlights).toBe(0);
	expect(histogram.luma.every((count) => count === 0)).toBe(true);
});
