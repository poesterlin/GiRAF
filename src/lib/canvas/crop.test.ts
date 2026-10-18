import { describe, expect, it } from 'bun:test';
import { getDisplayScale, getPreviewDimensions, sanitizeCrop, screenToCropSpace } from '$lib/canvas/crop';

describe('crop utilities', () => {
	it('sanitizeCrop normalizes and enforces minimum size', () => {
		const crop = { X: 'nope' as unknown as number, Y: 10, W: -30, H: 'bad' as unknown as number };
		sanitizeCrop(crop, { width: 100, height: 80 }, { width: 60, height: 40 });
		expect(crop.X).toBe(-30);
		expect(crop.Y).toBe(10);
		expect(crop.W).toBe(30);
		expect(crop.H).toBe(20);
	});

	it('screenToCropSpace accounts for padding and scale', () => {
		const result = screenToCropSpace(24 + 40, 24 + 30, 24, 2);
		expect(result.x).toBeCloseTo(20);
		expect(result.y).toBeCloseTo(15);
	});

	it('getPreviewDimensions respects resize settings', () => {
		expect(getPreviewDimensions(400, 100)).toEqual({ width: 400, height: 100 });
		expect(getPreviewDimensions(400, 100, { Enabled: true, LongEdge: 200 })).toEqual({ width: 200, height: 50 });
		expect(getPreviewDimensions(400, 100, { Enabled: true, Width: 300, Height: 200 })).toEqual({
			width: 300,
			height: 200
		});
	});

	it('getDisplayScale caps at 1 and picks the smallest ratio', () => {
		expect(getDisplayScale(100, 100, 200, 200)).toBe(1);
		expect(getDisplayScale(200, 100, 100, 200)).toBeCloseTo(0.5);
	});
});
