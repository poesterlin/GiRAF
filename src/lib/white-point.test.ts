import { expect, test } from 'bun:test';
import { whitePointFromPP3, whitePointToPP3 } from './white-point';

test('white point is neutral at zero stops', () => {
	expect(whitePointToPP3(0)).toBe(1);
	expect(whitePointFromPP3(1)).toBe(0);
});

test('each stop doubles the multiplier', () => {
	expect(whitePointToPP3(1)).toBe(2);
	expect(whitePointToPP3(-1)).toBe(0.5);
	expect(whitePointFromPP3(4)).toBe(2);
});

test('PP3 values round-trip through the stop scale', () => {
	for (const value of [0.25, 0.5, 1, 1.5, 2, 4]) {
		expect(Math.abs(whitePointToPP3(whitePointFromPP3(value)) - value)).toBeLessThan(0.001);
	}
});
