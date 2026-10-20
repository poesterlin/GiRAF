import { test, expect } from 'bun:test';
import {
	addLocalMask,
	deleteLocalMask,
	ensureMaskSettings,
	isGradientMask,
	maskColourRange,
	maskIndices,
	maskInverted,
	maskKind,
	maskSize,
	maskTools,
	setMaskColourRange,
	setMaskInverted,
	setMaskKind,
	setMaskSize,
	setMaskToolEnabled
} from './local-masks';
import { parsePP3, stringifyPP3, type PP3 } from './pp3-utils';
import { scaleEditSettings } from './edit-strength';

/** A mask as it was saved before the per-mask tools, the colour range and invert existed. */
function legacyMask(): PP3 {
	const settings: PP3 = {
		Locallab: {
			Enabled: true,
			Selspot: 0,
			Name_0: 'Mask 1',
			Isvisible_0: true,
			Activ_0: true,
			Shape_0: 'ELI',
			Loc_0: '500;500;500;500;',
			CenterX_0: 0,
			CenterY_0: 0,
			Feather_0: 25,
			Expcolor_0: true,
			Lightness_0: 0,
			Contrast_0: 0,
			Chroma_0: 0,
			Sensi_0: 60,
			Expexpose_0: true,
			Expcomp_0: 0.5,
			Sensiex_0: 100
		}
	};
	return settings;
}

test('a mask saved before a setting existed gets it, and keeps what it has', () => {
	const settings = legacyMask();
	settings.Locallab.Sharamount_0 = 80;
	ensureMaskSettings(settings);
	for (const tool of maskTools) {
		expect(settings.Locallab[`${tool.enable}_0`]).toBe(false);
		expect(settings.Locallab[`${tool.scope}_0`]).toBe(100);
		for (const control of tool.controls) expect(settings.Locallab[`${control.key}_0`]).not.toBeUndefined();
	}
	expect(settings.Locallab.Invers_0).toBe(false);
	// What the mask already set is left alone, including a narrower colour range
	expect(settings.Locallab.Expcomp_0).toBe(0.5);
	expect(settings.Locallab.Feather_0).toBe(25);
	expect(settings.Locallab.Sensi_0).toBe(60);
	expect(settings.Locallab.Sharamount_0).toBe(80);
});

test('a filled-in mask carries every key a fresh one does, and a photo without masks is untouched', () => {
	const settings = legacyMask();
	ensureMaskSettings(settings);
	const fresh: PP3 = {};
	addLocalMask(fresh, 'ELI');
	// The name and shape are the mask's identity; everything else must line up key for key
	expect(Object.keys(settings.Locallab).sort()).toEqual(Object.keys(fresh.Locallab).sort());
	// Running it again changes nothing
	const filled = JSON.stringify(settings);
	ensureMaskSettings(settings);
	expect(JSON.stringify(settings)).toBe(filled);

	const empty: PP3 = { Exposure: { Compensation: 1 } };
	ensureMaskSettings(empty);
	expect(Object.keys(empty).sort()).toEqual(['Exposure']);
	const noMasks: PP3 = { Locallab: { Enabled: false, Selspot: 0 } };
	ensureMaskSettings(noMasks);
	expect(Object.keys(noMasks.Locallab).sort()).toEqual(['Enabled', 'Selspot']);
});

test('local masks round trip multiple regions and compact unknown tool fields on deletion', () => {
	const settings: PP3 = {};
	addLocalMask(settings, 'ELI');
	addLocalMask(settings, 'RECT');
	settings.Locallab.Expcomp_1 = 1.5;
	settings.Locallab.CustomTool_1 = 42;
	setMaskSize(settings, 1, 'width', 70);
	expect(maskSize(settings, 1, 'width')).toBe(70);
	const parsed = parsePP3(stringifyPP3(settings));
	deleteLocalMask(parsed, 0);
	expect(maskIndices(parsed)).toEqual([0]);
	expect(parsed.Locallab.Shape_0).toBe('RECT');
	expect(parsed.Locallab.CustomTool_0).toBe(42);
	expect(parsed.Locallab.Expcomp_0).toBe(1.5);
	expect(scaleEditSettings(parsed, 50).Locallab.Expcomp_0).toBe(0.75);
	expect(scaleEditSettings(parsed, 0).Locallab.Enabled).toBe(false);
	deleteLocalMask(parsed, 0);
	expect(parsed.Locallab.Enabled).toBe(false);
});

test('a new mask arrives with every tool off, before and after a round trip', () => {
	const settings: PP3 = {};
	const index = addLocalMask(settings, 'ELI');
	for (const tool of maskTools) {
		expect(settings.Locallab[`${tool.enable}_${index}`]).toBe(false);
	}
	const parsed = parsePP3(stringifyPP3(settings));
	for (const tool of maskTools) {
		expect(parsed.Locallab[`${tool.enable}_0`]).toBe(false);
	}
});

test('turning a tool on writes the method and sliders RawTherapee needs with it', () => {
	const settings: PP3 = {};
	const index = addLocalMask(settings, 'ELI');
	const sharpening = maskTools.find((tool) => tool.enable === 'Expsharp')!;
	// Older masks, and profiles from RawTherapee's own editor, may carry no settings for the tool
	delete settings.Locallab[`methodcap_${index}`];
	delete settings.Locallab[`Sharamount_${index}`];
	setMaskToolEnabled(settings, index, sharpening, true);
	expect(settings.Locallab[`Expsharp_${index}`]).toBe(true);
	expect(settings.Locallab[`methodcap_${index}`]).toBe('rl');
	expect(settings.Locallab[`Sharamount_${index}`]).toBe(50);
	// A value the photo already has is left alone
	settings.Locallab[`Sharamount_${index}`] = 80;
	setMaskToolEnabled(settings, index, sharpening, true);
	expect(settings.Locallab[`Sharamount_${index}`]).toBe(80);
	setMaskToolEnabled(settings, index, sharpening, false);
	expect(settings.Locallab[`Expsharp_${index}`]).toBe(false);
});

test('edit strength scales per-mask amounts but not its radii', () => {
	const settings: PP3 = {};
	const index = addLocalMask(settings, 'ELI');
	for (const tool of maskTools) setMaskToolEnabled(settings, index, tool, true);
	settings.Locallab[`Warm_${index}`] = 40;
	settings.Locallab[`shadows_${index}`] = 80;
	settings.Locallab[`Lcamount_${index}`] = 0.5;
	settings.Locallab[`Sharamount_${index}`] = 60;
	settings.Locallab[`Sharradius_${index}`] = 2;

	const half = scaleEditSettings(settings, 50);
	expect(half.Locallab[`Warm_${index}`]).toBe(20);
	expect(half.Locallab[`shadows_${index}`]).toBe(40);
	expect(half.Locallab[`Lcamount_${index}`]).toBe(0.25);
	expect(half.Locallab[`Sharamount_${index}`]).toBe(30);
	expect(half.Locallab[`Sharradius_${index}`]).toBe(2);
	expect(half.Locallab[`Lcradius_${index}`]).toBe(80);
	expect(half.Locallab[`ShMethod_${index}`]).toBe('std');
});

test('a mask becomes a gradient covering the whole frame and back again', () => {
	const settings: PP3 = {};
	addLocalMask(settings, 'ELI');
	const index = addLocalMask(settings, 'ELI');
	settings.Locallab[`CenterY_${index}`] = -300;
	settings.Locallab[`Expcomp_${index}`] = 0.5;
	expect(maskKind(settings, index)).toBe('ELI');
	expect(settings.Locallab[`Strcol_${index}`]).toBe(0);

	setMaskKind(settings, index, 'GRADIENT');
	const parsed = parsePP3(stringifyPP3(settings));
	expect(maskKind(parsed, index)).toBe('GRADIENT');
	expect(isGradientMask(parsed, 0)).toBe(false);
	expect(parsed.Locallab[`Strcol_${index}`]).toBe(0);
	expect(parsed.Locallab[`Expcomp_${index}`]).toBe(0);
	expect(parsed.Locallab[`CenterY_${index}`]).toBe(-300);
	// Deleting the mask before it keeps it a gradient
	deleteLocalMask(parsed, 0);
	expect(isGradientMask(parsed, 0)).toBe(true);

	parsed.Locallab.Strcol_0 = 1;
	parsed.Locallab.Strcolab_0 = -1.5;
	setMaskKind(parsed, 0, 'RECT');
	expect(maskKind(parsed, 0)).toBe('RECT');
	expect(maskSize(parsed, 0, 'width')).toBe(50);
	expect(parsed.Locallab.Strcol_0).toBe(0);
	expect(parsed.Locallab.Strcolab_0).toBe(0);
	expect(parsed.Locallab.CenterY_0).toBe(-300);
});

test('choosing gradient again keeps its settings', () => {
	const settings: PP3 = {};
	const index = addLocalMask(settings, 'RECT');
	setMaskKind(settings, index, 'GRADIENT');
	settings.Locallab[`Angcol_${index}`] = 45;
	setMaskKind(settings, index, 'GRADIENT');
	expect(settings.Locallab[`Angcol_${index}`]).toBe(45);
});

test('gradient strength follows the edit strength', () => {
	const settings: PP3 = {};
	const index = addLocalMask(settings, 'ELI');
	setMaskKind(settings, index, 'GRADIENT');
	settings.Locallab[`Strcol_${index}`] = 2;
	settings.Locallab[`Strcolab_${index}`] = -2;
	expect(scaleEditSettings(settings, 50).Locallab[`Strcol_${index}`]).toBe(1);
	expect(scaleEditSettings(settings, 50).Locallab[`Strcolab_${index}`]).toBe(-1);
	expect(scaleEditSettings(settings, 50).Locallab[`Angcol_${index}`]).toBe(0);
});

test('colour range and invert set every tool of the mask together', () => {
	const settings: PP3 = {};
	addLocalMask(settings, 'ELI');
	const index = addLocalMask(settings, 'ELI');
	expect(maskColourRange(settings, index)).toBe(100);
	for (const tool of maskTools) expect(settings.Locallab[`${tool.scope}_${index}`]).toBe(100);

	setMaskColourRange(settings, index, 25);
	for (const key of ['Sensi', 'Sensiex', ...maskTools.map((tool) => tool.scope)]) expect(settings.Locallab[`${key}_${index}`]).toBe(25);
	expect(settings.Locallab.Sensi_0).toBe(100);

	for (const tool of maskTools) setMaskToolEnabled(settings, index, tool, true);
	setMaskInverted(settings, index, true);
	expect(maskInverted(settings, index)).toBe(true);
	for (const key of ['Invers', 'Inversex', ...maskTools.flatMap((tool) => (tool.invert ? [tool.invert] : []))]) expect(settings.Locallab[`${key}_${index}`]).toBe(true);
	// Tools without an invert setting are switched off, the others stay on
	for (const tool of maskTools) expect(settings.Locallab[`${tool.enable}_${index}`]).toBe(!!tool.invert);

	setMaskKind(settings, index, 'GRADIENT');
	expect(maskInverted(settings, index)).toBe(false);
	expect(maskColourRange(settings, index)).toBe(100);
});
