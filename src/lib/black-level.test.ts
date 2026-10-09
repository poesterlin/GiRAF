import { expect, test } from 'bun:test';
import { blackLevelFromPP3, blackLevelToPP3 } from './black-level';

test('black level caps negative adjustment at minus fifty and strengthens positive adjustment', () => {
	expect(blackLevelToPP3(-50)).toBe(2486);
	expect(blackLevelToPP3(100)).toBe(-32768);
	expect(blackLevelToPP3(0)).toBe(0);
	expect(blackLevelFromPP3(0)).toBe(0);
});

test('small negative changes have fine control rather than immediately lifting thousands of levels', () => {
	expect(blackLevelToPP3(-10)).toBeLessThan(200);
	expect(blackLevelToPP3(-0.1)).toBeGreaterThan(0);
	expect(blackLevelToPP3(-10)).toBeGreaterThan(blackLevelToPP3(-5));
});

test('existing PP3 values round-trip through the new slider scale', () => {
	for (const value of [-32768, -16384, -1200, -100, -1, 0, 1, 100, 1200, 32768]) {
		expect(blackLevelToPP3(blackLevelFromPP3(value))).toBe(value);
	}
});
