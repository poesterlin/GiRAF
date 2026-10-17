import { expect, test } from 'bun:test';
import { whitePointFromCurve, whitePointToCurve } from './white-point';

test('neutral white point leaves the curve empty', () => {
	expect(whitePointToCurve(0)).toBe('0;');
	expect(whitePointFromCurve('0;')).toBe(0);
	expect(whitePointFromCurve(undefined)).toBe(0);
});

test('positive values move the top point left and negative values move it down', () => {
	expect(whitePointToCurve(100)).toBe('1;0;0;0.5;1;');
	expect(whitePointToCurve(-100)).toBe('1;0;0;1;0.5;');
	expect(whitePointToCurve(20)).toBe('1;0;0;0.9;1;');
});

test('slider values round-trip through the curve', () => {
	for (const value of [-100, -37.5, -1, 1, 12.5, 100]) {
		expect(whitePointFromCurve(whitePointToCurve(value))).toBeCloseTo(value, 2);
	}
});

test('curves the slider did not write read as neutral', () => {
	expect(whitePointFromCurve('1;0;0;0.5;0.7;1;1;')).toBe(0);
	expect(whitePointFromCurve('2;0.25;0.5;0.75;')).toBe(0);
});
