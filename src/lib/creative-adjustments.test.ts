import { test, expect } from 'bun:test';
import { creativeDefaults, toneColor, setToneColor, gradingPresets, applyGradingPreset, enableMonochromeMixer } from './creative-adjustments';
import { createGroupedDocument, restoreGroupedSettings } from './adjustment-groups';
import { scaleEditSettings } from './edit-strength';
import { parsePP3, stringifyPP3 } from './pp3-utils';
import { parsePP3Document, stringifyPP3Document } from './pp3-document';

test('grading presets preserve unrelated edits and serialize RawTherapee saturation/hue pairs', () => {
	const settings = { ...structuredClone(creativeDefaults), Exposure: { Compensation: 1.5 } };
	applyGradingPreset(settings, gradingPresets[0]);
	const restored = parsePP3(stringifyPP3(settings));
	expect(toneColor(restored, 'Shadows')).toEqual({ hue: 200, saturation: 15 });
	expect(toneColor(restored, 'Highlights')).toEqual({ hue: 40, saturation: 18 });
	expect(restored.ColorToning.Method).toBe('Splitlr');
	expect(restored.Exposure.Compensation).toBe(1.5);
	setToneColor(settings, 'Shadows', -20, 120);
	expect(toneColor(settings, 'Shadows')).toEqual({ hue: 340, saturation: 100 });
	expect(() => setToneColor(settings, 'Shadows', NaN, 20)).toThrow();
});

test('grading and monochrome bypass retain their editable settings in snapshots', () => {
	const settings = structuredClone(creativeDefaults);
	applyGradingPreset(settings, gradingPresets[0]);
	enableMonochromeMixer(settings);
	settings['Black_&_White'].MixerRed = 60;
	const document = createGroupedDocument(settings, ['colorGrading', 'monochrome']);
	expect(document.settings.ColorToning.Enabled).toBe(false);
	expect(document.settings['Black_&_White'].Enabled).toBe(false);
	const restored = restoreGroupedSettings(parsePP3Document(stringifyPP3Document(document)));
	expect(restored).toEqual(settings);
});

test('edit strength scales grading with integral RT strength and zero disables both new tools', () => {
	const settings = structuredClone(creativeDefaults);
	applyGradingPreset(settings, gradingPresets[0]);
	enableMonochromeMixer(settings);
	settings.ColorToning.Strength = 79;
	expect(scaleEditSettings(settings, 50).ColorToning.Strength).toBe(40);
	expect(scaleEditSettings(settings, 0).ColorToning.Enabled).toBe(false);
	expect(scaleEditSettings(settings, 0)['Black_&_White'].Enabled).toBe(false);
	expect(settings.ColorToning.Strength).toBe(79);
});
