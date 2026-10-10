import { expect, test } from 'bun:test';
import { defaultLevels, levelsFromCurve, levelsToCurve, midpoint, moveLevel } from './levels';
import { supportsWasmPreview } from './preview-parity-policy';
import { stringifyPP3 } from './pp3-utils';

test('levels survive PP3 save/reload at both gamma extremes and tight endpoints', () => {
	expect(levelsFromCurve(levelsToCurve(defaultLevels))).toEqual(defaultLevels);
	for (const gamma of [0.2, 0.7, 1, 1.8, 5]) {
		for (const [black, white] of [[0, 255], [20, 220], [120, 122]]) {
			const levels = { black, white, gamma };
			expect(levelsFromCurve(levelsToCurve(levels))).toEqual(levels);
			const values = levelsToCurve(levels).split(';').filter(Boolean).map(Number);
			if (values.length === 1) continue;
			expect(values[2]).toBe(0);
			expect(values.at(-1)).toBe(1);
			for (let i = 3; i < values.length; i += 2) {
				expect(values[i]).toBeGreaterThan(values[i - 2]);
				expect(values[i + 1]).toBeGreaterThanOrEqual(values[i - 1]);
			}
		}
	}
});

test('handles cannot cross and middle handle maps back to gamma', () => {
	expect(moveLevel(defaultLevels, 'black', 255).black).toBe(253);
	expect(moveLevel(defaultLevels, 'white', 0).white).toBe(2);
	const levels = { black: 20, white: 230, gamma: 2 };
	expect(moveLevel(levels, 'gamma', midpoint(levels)).gamma).toBeCloseTo(2);
	expect(moveLevel(levels, 'gamma', -100).gamma).toBe(5);
});

test('unrelated imported tone curves are not treated as levels', () => {
	for (const curve of ['1;0;0;1;1;', '2;0.25;0.5;0.75;0;0;0;0;', 'garbage']) {
		expect(levelsFromCurve(curve)).toBeNull();
	}
});

test('active levels use reference rendering and reset restores browser eligibility', () => {
	const settings = { Exposure: { Auto: false, Curve2: levelsToCurve({ black: 20, white: 230, gamma: 1.2 }) } };
	expect(supportsWasmPreview(stringifyPP3(settings))).toBe(false);
	settings.Exposure.Curve2 = levelsToCurve(defaultLevels);
	expect(supportsWasmPreview(stringifyPP3(settings))).toBe(true);
});
