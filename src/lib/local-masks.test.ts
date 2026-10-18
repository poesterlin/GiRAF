import { test, expect } from 'bun:test';
import { addLocalMask, deleteLocalMask, maskIndices, maskSize, maskTools, setMaskSize, setMaskToolEnabled } from './local-masks';
import { parsePP3, stringifyPP3, type PP3 } from './pp3-utils';
import { scaleEditSettings } from './edit-strength';

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
