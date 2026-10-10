import { expect, test } from 'bun:test';
import { curveDragSensitivity, curveSamples, identityPoints, moveCurvePoint, readToneCurve, writeToneCurve } from './tone-curve';

test('relative dragging becomes less sensitive farther from the diagonal on either side', () => {
	expect(curveDragSensitivity({ x: 0.5, y: 0.5 })).toBe(0.35);
	expect(curveDragSensitivity({ x: 0.25, y: 0.75 })).toBeCloseTo(0.35 / 25);
	expect(curveDragSensitivity({ x: 0.75, y: 0.25 })).toBeCloseTo(0.35 / 25);
	expect(curveDragSensitivity({ x: 0, y: 1 })).toBeCloseTo(0.35 / 81);
});

test('tone curve points survive PP3 serialization and identity resets', () => {
	const points = [{ x: 0, y: 0 }, { x: 0.3, y: 0.2 }, { x: 0.7, y: 0.8 }, { x: 1, y: 1 }];
	expect(readToneCurve(writeToneCurve(points))).toEqual(points);
	expect(writeToneCurve(identityPoints())).toBe('0;');
	expect(readToneCurve('0;')).toEqual(identityPoints());
	expect(readToneCurve('1;0;0;0;1;')).toBeNull();
	expect(readToneCurve('2;0.25;0.5;0.75;0;0;0;0;')).toBeNull();
});

test('point movement is bounded and cannot cross neighboring points', () => {
	const points = [{ x: 0, y: 0 }, { x: 0.5, y: 0.5 }, { x: 1, y: 1 }];
	expect(moveCurvePoint(points, 1, 2, -1)[1]).toEqual({ x: 0.998, y: 0 });
	expect(points[1]).toEqual({ x: 0.5, y: 0.5 });
	expect(moveCurvePoint(points, 1, -1, 2)[1]).toEqual({ x: 0.002, y: 1 });
});

test('visible spline passes through control points and stays in display bounds', () => {
	const points = [{ x: 0, y: 0 }, { x: 0.25, y: 0.4 }, { x: 0.75, y: 0.6 }, { x: 1, y: 1 }];
	const samples = curveSamples(points);
	expect(samples[64].y).toBeCloseTo(0.4);
	expect(samples[192].y).toBeCloseTo(0.6);
	expect(samples.every((p) => Number.isFinite(p.y) && p.y >= 0 && p.y <= 1)).toBe(true);
	expect(curveSamples(identityPoints())[128]).toEqual({ x: 0.5, y: 0.5 });
});
