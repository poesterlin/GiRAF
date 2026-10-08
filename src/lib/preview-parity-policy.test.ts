import { expect, test } from 'bun:test';
import { fromBase64, stringifyPP3, toBase64, type PP3 } from './pp3-utils';
import { getRequiredClutPath, supportsWasmPreview, WASM_PREVIEW_PARITY_VERIFIED } from './preview-parity-policy';

test('verified native output is enabled with separate capability routing', () => {
	expect(WASM_PREVIEW_PARITY_VERIFIED).toBe(true);
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

test('unsupported tools and profiles use reference processing', () => {
	const cases: PP3[] = [
		{ Sharpening: { Enabled: true, Amount: 50 } },
		{ Sharpening: { Enabled: true, Amount: 0, Method: 'rld' } },
		{ White_Balance: { Setting: 'Auto' } },
		{ Color_Management: { WorkingProfile: 'Adobe RGB' } },
		{ Color_Management: { InputProfile: '/custom.icc' } },
		{ FattalToneMapping: { Enabled: true } },
		{ 'Shadows_&_Highlights': { Enabled: true, Shadows: 20 } },
		{ Exposure: { Curve: '3;0;0;1;1;' } },
		{ Resize: { Enabled: true } },
		{ Vibrance: { Enabled: true, Pastels: 30, Saturated: 0 } },
		{ Local_Contrast: { Enabled: true, Amount: 0.2, Radius: 80 } }
	];
	for (const pp3 of cases) expect(supportsWasmPreview(stringifyPP3(pp3))).toBe(false);
});

test('supported scalar controls and inert default tools remain eligible', () => {
	expect(
		supportsWasmPreview(
			stringifyPP3({
				Exposure: { Auto: true, Clip: 0.02, Compensation: 1 },
				White_Balance: { Enabled: true, Setting: 'Custom', Temperature: 4500, Green: 1.2 },
				Rotation: { Enabled: true, Degree: 3 },
				Crop: { Enabled: true, X: 10, Y: 10, W: 100, H: 80 },
				Sharpening: { Enabled: true, Amount: 0, Radius: 0.5 },
				FattalToneMapping: { Enabled: false, Amount: 20 },
				Vibrance: { Enabled: false, Pastels: 30 },
				Local_Contrast: { Enabled: false, Amount: 0.2 }
			})
		)
	).toBe(true);
});
