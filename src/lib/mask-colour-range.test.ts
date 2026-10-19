import { expect, test } from 'bun:test';
import { colourDistance, colourRangeWeight, maskWeights, referenceColour, rgbToLab, toLabImage } from './mask-colour-range';

test('sRGB converts to the expected Lab', () => {
	const white = rgbToLab(255, 255, 255);
	expect(white.l).toBeCloseTo(100, 0);
	expect(Math.abs(white.a)).toBeLessThan(0.5);
	expect(rgbToLab(0, 0, 0).l).toBeCloseTo(0, 1);
	expect(rgbToLab(255, 0, 0).a).toBeGreaterThan(70);
});

test('the colour range follows the measured falloff', () => {
	// Scope 20 measured about half the effect around a distance of 13 and almost none past 30
	expect(colourRangeWeight(0, 20)).toBeGreaterThan(0.95);
	expect(colourRangeWeight(13, 20)).toBeCloseTo(0.5, 1);
	expect(colourRangeWeight(30, 20)).toBeLessThan(0.05);
	expect(colourRangeWeight(80, 100)).toBe(1);
	// A wider range lets more distant colours through
	expect(colourRangeWeight(20, 60)).toBeGreaterThan(colourRangeWeight(20, 20));
});

test('lightness counts half as much as colour', () => {
	const grey = { l: 50, a: 0, b: 0 };
	expect(colourDistance(grey, { l: 60, a: 0, b: 0 })).toBeCloseTo(Math.sqrt(50), 5);
	expect(colourDistance(grey, { l: 50, a: 10, b: 0 })).toBe(10);
});

test('weights cover the mask area, or everything but it when inverted', () => {
	// A 4x2 photo: blue on the left half, orange on the right half
	const rgba = new Uint8ClampedArray(4 * 2 * 4);
	for (let y = 0; y < 2; y++) for (let x = 0; x < 4; x++) rgba.set(x < 2 ? [80, 120, 220, 255] : [240, 140, 40, 255], (y * 4 + x) * 4);
	const image = toLabImage(rgba, 4, 2);
	const blue = referenceColour(image, 0, 0, 0);
	const everywhere = { shape: 'RECT' as const, centerX: 0.5, centerY: 0.5, halfWidth: 1, halfHeight: 1, inverted: false };
	const narrow = maskWeights(image, everywhere, blue, 20);
	expect(narrow[0]).toBeGreaterThan(0.95);
	expect(narrow[3]).toBeLessThan(0.05);
	expect(maskWeights(image, everywhere, blue, 100)[3]).toBe(1);
	const leftHalf = { shape: 'RECT' as const, centerX: 0.25, centerY: 0.5, halfWidth: 0.25, halfHeight: 1, inverted: false };
	expect(Array.from(maskWeights(image, leftHalf, blue, 100))).toEqual([1, 1, 0, 0, 1, 1, 0, 0]);
	expect(Array.from(maskWeights(image, { ...leftHalf, inverted: true }, blue, 100))).toEqual([0, 0, 1, 1, 0, 0, 1, 1]);
});
