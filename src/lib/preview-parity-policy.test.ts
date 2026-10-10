import { expect, test } from 'bun:test';
import { fromBase64, stringifyPP3, toBase64, type PP3 } from './pp3-utils';
import { getRequiredClutPath, supportsWasmPreview, WASM_PREVIEW_PARITY_VERIFIED } from './preview-parity-policy';

test('verified native output is enabled with separate capability routing', () => {
	expect(WASM_PREVIEW_PARITY_VERIFIED).toBe(true);
});

test('moderate channel calibration is eligible; extreme or malformed matrices require reference processing', () => {
	const mixer = { Enabled: true, Red: '1100;-50;-50;', Green: '0;1000;0;', Blue: '0;0;1000;' };
	expect(supportsWasmPreview(stringifyPP3({ Channel_Mixer: mixer }))).toBe(true);
	for (const Red of ['1200;-100;-100;', 'NaN;0;0;', '1000;0;', '1000;0;0;1;', '1000oops;0;0;', '1000.5;0;0;']) {
		expect(supportsWasmPreview(stringifyPP3({ Channel_Mixer: { ...mixer, Red } }))).toBe(false);
	}
	expect(supportsWasmPreview(stringifyPP3({ Channel_Mixer: { ...mixer, Unknown: true } }))).toBe(false);
	expect(supportsWasmPreview('[Channel Mixer]\nEnabled=true')).toBe(false);
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

test('disabled vignette preserves browser previews while active vignette uses reference rendering', () => {
	const settings = { PCVignette: { Enabled: false, Strength: 1, Feather: 50, Roundness: 50 } };
	expect(supportsWasmPreview(stringifyPP3(settings))).toBe(true);
	settings.PCVignette.Enabled = true;
	expect(supportsWasmPreview(stringifyPP3(settings))).toBe(false);
	settings.PCVignette.Strength = -1;
	expect(supportsWasmPreview(stringifyPP3(settings))).toBe(false);
});

test('zero-strength Dehaze in older editor snapshots does not block browser previews', () => {
	const settings: PP3 = {
		Exposure: { Enabled: true, Auto: false, Compensation: 1 },
		Dehaze: { Enabled: true, Strength: 0, Depth: 25, Saturation: 50, ShowDepthMap: false }
	};
	expect(supportsWasmPreview(stringifyPP3(settings))).toBe(true);
	expect(settings.Dehaze.Enabled).toBe(true);
	settings.Dehaze.Strength = 10;
	expect(supportsWasmPreview(stringifyPP3(settings))).toBe(false);
	settings.Dehaze.Enabled = false;
	expect(supportsWasmPreview(stringifyPP3(settings))).toBe(true);
});

test('Dehaze depth maps, unknown options and unproven strengths require the reference renderer', () => {
	const cases: PP3[string][] = [
		{ Enabled: true, Strength: 0, ShowDepthMap: true },
		{ Enabled: true, Strength: 0, UnknownOption: true },
		{ Enabled: true },
		{ Enabled: true, Strength: false },
		{ Enabled: true, Strength: -1 },
		{ Enabled: true, Strength: 'invalid' }
	];
	for (const fields of cases) expect(supportsWasmPreview(stringifyPP3({ Dehaze: fields }))).toBe(false);
});

test('neutral Vibrance is eligible but active controls, skin curves and unknown options are not', () => {
	const neutral = { Enabled: true, Pastels: 0, Saturated: 0, SkinTonesCurve: '0;', ProtectSkins: true, AvoidColorShift: true };
	expect(supportsWasmPreview(stringifyPP3({ Vibrance: neutral }))).toBe(true);
	const changes: PP3[string][] = [
		{ Pastels: 20 }, { Saturated: -10 }, { SkinTonesCurve: '1;0;0;1;0.8;' },
		{ UnknownOption: true }, { Pastels: false }
	];
	for (const change of changes) {
		expect(supportsWasmPreview(stringifyPP3({ Vibrance: { ...neutral, ...change } }))).toBe(false);
	}
	expect(supportsWasmPreview('[Vibrance]\nEnabled=true')).toBe(false);
});
