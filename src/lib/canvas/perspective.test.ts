import { describe, expect, it } from 'bun:test';
import { getAutoFillScale } from '$lib/canvas/crop';
import { forwardPoint, getPerspectiveGeometry, inversePoint } from '$lib/canvas/perspective';

const size = { width: 1000, height: 667 };

describe('perspective geometry', () => {
	it('is the identity when nothing is set', () => {
		const geometry = getPerspectiveGeometry(size.width, size.height, { vertical: 0, horizontal: 0, degree: 0 });
		expect(geometry.autoFill).toBe(1);
		expect(inversePoint(geometry, 120, 340)).toEqual({ x: 120, y: 340 });
		expect(forwardPoint(geometry, 120, 340)).toEqual({ x: 120, y: 340 });
	});

	it('matches the rotation-only AutoFill', () => {
		for (const degree of [-12, -5, 0.4, 7, 30]) {
			const geometry = getPerspectiveGeometry(size.width, size.height, { vertical: 0, horizontal: 0, degree });
			expect(1 / geometry.autoFill).toBeCloseTo(getAutoFillScale(size.width, size.height, degree), 2);
		}
	});

	it('uses RawTherapee’s AutoFill scale for the simple perspective', () => {
		const vertical = getPerspectiveGeometry(size.width, size.height, { vertical: 30, horizontal: 0, degree: 0 });
		const horizontal = getPerspectiveGeometry(size.width, size.height, { vertical: 0, horizontal: 40, degree: 0 });
		const both = getPerspectiveGeometry(size.width, size.height, { vertical: 30, horizontal: 40, degree: 5 });
		expect(vertical.autoFill).toBeCloseTo(0.8658, 3);
		expect(horizontal.autoFill).toBeCloseTo(0.6979, 3);
		expect(both.autoFill).toBeCloseTo(0.655, 3);
	});

	it('keeps the output border inside the source at that scale', () => {
		const geometry = getPerspectiveGeometry(size.width, size.height, { vertical: -35, horizontal: 20, degree: 8 });
		for (let x = 0; x < size.width; x += 7) {
			for (const y of [0, size.height - 1]) {
				const point = inversePoint(geometry, x, y);
				expect(point.x).toBeGreaterThanOrEqual(-1e-6);
				expect(point.x).toBeLessThanOrEqual(size.width - 1 + 1e-6);
				expect(point.y).toBeGreaterThanOrEqual(-1e-6);
				expect(point.y).toBeLessThanOrEqual(size.height - 1 + 1e-6);
			}
		}
	});

	it('round-trips forward and inverse points', () => {
		for (const params of [
			{ vertical: 20, horizontal: 0, degree: 4 },
			{ vertical: 0, horizontal: -35, degree: -9 },
			{ vertical: -18, horizontal: 27, degree: 12 },
			{ vertical: 100, horizontal: -100, degree: 0 }
		]) {
			const geometry = getPerspectiveGeometry(size.width, size.height, params);
			for (const [x, y] of [
				[0, 0],
				[size.width - 1, 0],
				[0, size.height - 1],
				[size.width - 1, size.height - 1],
				[413, 129],
				[777, 512]
			]) {
				const output = forwardPoint(geometry, x, y);
				const source = inversePoint(geometry, output.x, output.y);
				expect(source.x).toBeCloseTo(x, 6);
				expect(source.y).toBeCloseTo(y, 6);
			}
		}
	});

	it('mirrors positive and negative sliders', () => {
		for (const value of [5, 30, 100]) {
			const positive = getPerspectiveGeometry(size.width, size.height, { vertical: value, horizontal: value, degree: 0 });
			const negative = getPerspectiveGeometry(size.width, size.height, { vertical: -value, horizontal: -value, degree: 0 });
			expect(negative.vTan).toBeCloseTo(-positive.vTan, 10);
			expect(negative.vCos).toBeCloseTo(positive.vCos, 10);
			expect(negative.hTan).toBeCloseTo(-positive.hTan, 10);
			expect(negative.hCos).toBeCloseTo(positive.hCos, 10);
			expect(negative.autoFill).toBeCloseTo(positive.autoFill, 10);
		}
	});

	it('stays finite across the slider range', () => {
		for (const vertical of [-100, -50, -1, 0.5, 1, 50, 100]) {
			for (const horizontal of [-100, -37, 0, 12, 100]) {
				for (const degree of [-45, -3.5, 0, 8, 45]) {
					const geometry = getPerspectiveGeometry(size.width, size.height, { vertical, horizontal, degree });
					for (const value of Object.values(geometry)) {
						expect(Number.isFinite(value)).toBe(true);
					}
					expect(geometry.autoFill).toBeGreaterThan(0);
					expect(geometry.autoFill).toBeLessThanOrEqual(2);
					const point = inversePoint(geometry, 0, 0);
					expect(Number.isFinite(point.x) && Number.isFinite(point.y)).toBe(true);
				}
			}
		}
	});
});
