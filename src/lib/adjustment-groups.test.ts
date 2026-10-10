import { expect, test } from 'bun:test';
import { createGroupedDocument, restoreGroupedSettings, groupNeutralSettings, normalizeDisabledGroups } from './adjustment-groups';
import { parsePP3Document, stringifyPP3Document } from './pp3-document';
import type { PP3 } from './pp3-utils';

const settings: PP3 = {
	Exposure: { Auto: true, Compensation: 1.5, Brightness: 20, Contrast: 10, Black: 100, Saturation: 25, HighlightCompr: 30 },
	White_Balance: { Setting: 'Custom', Temperature: 6200, Green: 1.1 },
	Other: { Value: 3 },
	'Shadows_&_Highlights': { Enabled: true, Shadows: 25 },
	Vibrance: { Enabled: false, Pastels: 30 },
	HSV_Equalizer: { Enabled: true, HCurve: '1;0;0.6;0.35;0.35;' },
	Local_Contrast: { Enabled: true, Amount: 0.3 },
	Dehaze: { Enabled: false, Strength: 20 },
	Sharpening: { Enabled: true, Amount: 80 },
	Film_Simulation: { Enabled: true, Strength: 70 },
	Channel_Mixer: { Enabled: true, Red: '900;0;0;' },
	Crop: { Enabled: true, X: 10, Y: 20, W: 100, H: 200 }
};

test('turning Light off leaves Color and geometry unchanged', () => {
	const document = createGroupedDocument(settings, ['light']);
	expect(document.settings.Exposure.Compensation).toBe(0);
	expect(document.settings.Exposure.Auto).toBe(false);
	expect(document.settings.Exposure.Saturation).toBe(25);
	expect(document.settings.Crop).toEqual(settings.Crop);
	expect(settings.Exposure.Compensation).toBe(1.5);
});

test('Color off preserves exposure and the individual tool enabled states round-trip', () => {
	const document = createGroupedDocument(settings, ['color']);
	expect(document.settings.Exposure.Saturation).toBe(0);
	expect(document.settings.Exposure.Compensation).toBe(1.5);
	expect(document.settings.HSV_Equalizer.Enabled).toBe(false);
	const restored = restoreGroupedSettings(parsePP3Document(stringifyPP3Document(document)));
	expect(restored.Vibrance.Enabled).toBe(false);
	expect(restored.HSV_Equalizer.Enabled).toBe(true);
	expect(restored.Exposure.Saturation).toBe(25);
});

test('all groups can be disabled and restored through PP3 metadata', () => {
	const document = createGroupedDocument(settings, Object.keys(groupNeutralSettings));
	expect(document.settings.White_Balance.Setting).toBe('Camera');
	expect(document.settings.Local_Contrast.Enabled).toBe(false);
	expect(document.settings.Sharpening.Enabled).toBe(false);
	expect(document.settings.Film_Simulation.Enabled).toBe(false);
	const restored = restoreGroupedSettings(parsePP3Document(stringifyPP3Document(document)));
	for (const [section, values] of Object.entries(settings)) {
		for (const [key, value] of Object.entries(values)) expect(restored[section][key]).toEqual(value);
	}
});

test('Light and Dynamic Range can be bypassed independently', () => {
	const lightOff = createGroupedDocument(settings, ['exposure']);
	expect(lightOff.settings.Exposure.Compensation).toBe(0);
	expect(lightOff.settings.Exposure.HighlightCompr).toBe(30);
	expect(lightOff.settings['Shadows_&_Highlights'].Enabled).toBe(true);
	const rangeOff = createGroupedDocument(settings, ['dynamicRange']);
	expect(rangeOff.settings.Exposure.Compensation).toBe(1.5);
	expect(rangeOff.settings.Exposure.HighlightCompr).toBe(0);
	expect(rangeOff.settings['Shadows_&_Highlights'].Enabled).toBe(false);
});

test('global Color and Color Mixer can be bypassed independently', () => {
	const globalOff = createGroupedDocument(settings, ['globalColor']);
	expect(globalOff.settings.Exposure.Saturation).toBe(0);
	expect(globalOff.settings.HSV_Equalizer.Enabled).toBe(true);
	const mixerOff = createGroupedDocument(settings, ['colorMixer']);
	expect(mixerOff.settings.Exposure.Saturation).toBe(25);
	expect(mixerOff.settings.HSV_Equalizer.Enabled).toBe(false);
});

test('older disabled groups retain their full bypass behavior after splitting', () => {
	const old = createGroupedDocument(settings, ['light', 'color']);
	const split = createGroupedDocument(settings, normalizeDisabledGroups(['light', 'color', 'exposure']));
	expect(split.settings).toEqual(old.settings);
	expect(split.ui?.disabledGroups).toEqual(['exposure', 'dynamicRange', 'globalColor', 'colorMixer']);
});

test('nested saturation bypass and parent Color restore remembered values', () => {
	const document = createGroupedDocument(settings, ['globalColor', 'saturation']);
	expect(document.settings.Exposure.Saturation).toBe(0);
	const restored = restoreGroupedSettings(parsePP3Document(stringifyPP3Document(document)));
	expect(restored.Exposure.Saturation).toBe(25);
	expect(restored.Vibrance.Enabled).toBe(false);
});
test('Tone Curve bypass preserves its points and leaves other exposure settings unchanged', () => {
	const settings = { Exposure: { Auto: false, Compensation: 1, Curve: '0;', Curve2: '1;0;0;0.5;0.7;1;1;' } };
	const document = createGroupedDocument(settings, ['toneCurve']);
	expect(document.settings.Exposure.Curve2).toBe('0;');
	expect(document.settings.Exposure.Compensation).toBe(1);
	expect(document.settings.Exposure.Curve).toBe('0;');
	expect(restoreGroupedSettings(document)).toEqual(settings);
});
