import { describe, expect, it } from 'bun:test';
import { checkHandleCollision, getCropHandles, moveHandle } from '$lib/canvas/grid';
import type { PP3 } from '$lib/pp3-utils';

const makePP3 = (crop: { X: number; Y: number; W: number; H: number }): PP3<number> => ({
	Crop: { ...crop }
});

describe('crop grid handles', () => {
	it('getCropHandles returns 4 handles at expected positions', () => {
		const pp3 = makePP3({ X: 10, Y: 20, W: 40, H: 60 });
		const handles = getCropHandles(pp3);
		expect(handles).toHaveLength(4);
		expect(handles[0]).toEqual({ name: 'nw', x: 2, y: 12, w: 16, h: 16 });
		expect(handles[1]).toEqual({ name: 'ne', x: 42, y: 12, w: 16, h: 16 });
		expect(handles[2]).toEqual({ name: 'sw', x: 2, y: 72, w: 16, h: 16 });
		expect(handles[3]).toEqual({ name: 'se', x: 42, y: 72, w: 16, h: 16 });
	});
	it('selects the nearest corner when touch targets overlap on a small crop', () => {
		const pp3 = makePP3({ X: 10, Y: 20, W: 24, H: 24 });
		expect(checkHandleCollision(pp3, 34, 44, 24)).toBe('se');
		expect(checkHandleCollision(pp3, 34, 20, 24)).toBe('ne');
		expect(checkHandleCollision(pp3, 10, 44, 24)).toBe('sw');
	});

	it('checkHandleCollision respects hit slop', () => {
		const pp3 = makePP3({ X: 10, Y: 20, W: 40, H: 60 });
		expect(checkHandleCollision(pp3, 5, 15, 0)).toBe('nw');
		expect(checkHandleCollision(pp3, 0, 0, 0)).toBeUndefined();
		expect(checkHandleCollision(pp3, 0, 10, 10)).toBe('nw');
	});
});

describe('moveHandle', () => {
	it('adjusts each handle direction', () => {
		const base = { X: 10, Y: 10, W: 40, H: 40 };
		const dimensions = { width: 200, height: 200 };

		const pp3NW = makePP3(base);
		moveHandle(pp3NW, 'nw', 5, 5, dimensions);
		expect(pp3NW.Crop.X).toBe(15);
		expect(pp3NW.Crop.Y).toBe(15);
		expect(pp3NW.Crop.W).toBe(35);
		expect(pp3NW.Crop.H).toBe(35);

		const pp3NE = makePP3(base);
		moveHandle(pp3NE, 'ne', 5, 5, dimensions);
		expect(pp3NE.Crop.Y).toBe(15);
		expect(pp3NE.Crop.W).toBe(45);
		expect(pp3NE.Crop.H).toBe(35);

		const pp3SW = makePP3(base);
		moveHandle(pp3SW, 'sw', 5, 5, dimensions);
		expect(pp3SW.Crop.X).toBe(15);
		expect(pp3SW.Crop.W).toBe(35);
		expect(pp3SW.Crop.H).toBe(45);

		const pp3SE = makePP3(base);
		moveHandle(pp3SE, 'se', 5, 5, dimensions);
		expect(pp3SE.Crop.W).toBe(45);
		expect(pp3SE.Crop.H).toBe(45);
	});

	it('rectifies negative dimensions and clamps to bounds', () => {
		const pp3 = makePP3({ X: 10, Y: 10, W: 10, H: 10 });
		moveHandle(pp3, 'nw', 30, 30, { width: 50, height: 50 });
		expect(pp3.Crop.W).toBeGreaterThan(0);
		expect(pp3.Crop.H).toBeGreaterThan(0);
		expect(pp3.Crop.X).toBeGreaterThanOrEqual(0);
		expect(pp3.Crop.Y).toBeGreaterThanOrEqual(0);
	});

	it('enforces minimum size of 20', () => {
		const pp3 = makePP3({ X: 5, Y: 5, W: 5, H: 5 });
		moveHandle(pp3, 'se', -2, -2, { width: 100, height: 100 });
		expect(pp3.Crop.W).toBeGreaterThanOrEqual(20);
		expect(pp3.Crop.H).toBeGreaterThanOrEqual(20);
	});
});
