import { test, expect } from 'bun:test';
import { compare } from './metrics';
test('exact equality and analytically known channel/pixel error', () => {
	const a = new Uint8Array([0, 0, 0, 10, 20, 30]);
	expect(compare(a, a, 2, 1).metrics).toEqual({
		mae: 0,
		rmse: 0,
		psnr: null,
		p50: 0,
		p95: 0,
		p99: 0,
		max: 0,
		perceptual: { meanDeltaE00: 0, p50: 0, p95: 0, p99: 0, max: 0, fractionAbove2: 0, fractionAbove5: 0, fractionAbove10: 0 }
	});
	const { metrics } = compare(a, new Uint8Array([3, 4, 0, 10, 20, 30]), 2, 1);
	expect(metrics.mae).toBeCloseTo(7 / 6);
	expect(metrics.rmse).toBeCloseTo(Math.sqrt(25 / 6));
	expect(metrics.p99).toBe(4);
	expect(metrics.psnr).toBeCloseTo(20 * Math.log10(255 / Math.sqrt(25 / 6)));
});
test('rejects incompatible buffers', () => {
	expect(() => compare(new Uint8Array(3), new Uint8Array(6), 1, 1)).toThrow();
	expect(() => compare(new Uint8Array(0), new Uint8Array(0), 0, 0)).toThrow();
});
test('perceptual distribution counts pixels and uses nearest-rank percentiles', () => {
	const { perceptual: p } = compare(new Uint8Array(12), new Uint8Array([0, 0, 0, 255, 255, 255, 0, 0, 0, 255, 255, 255]), 4, 1).metrics;
	expect(p.meanDeltaE00).toBeCloseTo(50, 4);
	expect(p.p50).toBe(0);
	expect(p.p95).toBeCloseTo(100, 4);
	expect(p.p99).toBe(p.max);
	expect(p.fractionAbove2).toBe(0.5);
	expect(p.fractionAbove5).toBe(0.5);
	expect(p.fractionAbove10).toBe(0.5);
});
