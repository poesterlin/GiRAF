import { expect, test } from 'bun:test';
import { fromBase64, stringifyPP3, toBase64 } from './pp3-utils';
import { getRequiredClutPath, WASM_PREVIEW_PARITY_VERIFIED } from './preview-parity-policy';

test('unverified native output cannot be selected for production previews', () => {
	expect(WASM_PREVIEW_PARITY_VERIFIED).toBe(false);
});

test('LUT selection respects its chapter, enabled flag, and strength', () => {
	expect(getRequiredClutPath('[Other]\nClutFilename=/wrong.png')).toBeNull();
	expect(getRequiredClutPath('[Film Simulation]\nEnabled=false\nClutFilename=/disabled.png')).toBeNull();
	expect(getRequiredClutPath('[Film Simulation]\nEnabled=true\nStrength=0\nClutFilename=/zero.png')).toBeNull();
	expect(getRequiredClutPath('[Film Simulation]\nEnabled=true\nStrength=50\nClutFilename=/film.png')).toBe('/film.png');
});

test('UTF-8 settings and LUT paths survive the worker transport', () => {
	const pp3 = stringifyPP3({ Film_Simulation: { Enabled: true, ClutFilename: '/films/été 日本.png' } });
	expect(getRequiredClutPath(fromBase64(toBase64(pp3)))).toBe('/films/été 日本.png');
});
