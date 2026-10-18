import { expect, test } from 'bun:test';
import { parsePP3, stringifyPP3 } from './pp3-utils';

test('values containing = are kept whole', () => {
	const pp3 = parsePP3('[Film Simulation]\nClutFilename=/luts/a=b.png\nStrength=100\n');
	expect(pp3.Film_Simulation).toEqual({ ClutFilename: '/luts/a=b.png', Strength: 100 });
	expect(parsePP3(stringifyPP3(pp3))).toEqual(pp3);
});

test('chapter names with spaces round-trip', () => {
	const pp3 = parsePP3('[Impulse Denoising]\nEnabled=true\nThreshold=50\n');
	expect(pp3.Impulse_Denoising).toEqual({ Enabled: true, Threshold: 50 });
	expect(stringifyPP3(pp3)).toContain('[Impulse Denoising]');
});
