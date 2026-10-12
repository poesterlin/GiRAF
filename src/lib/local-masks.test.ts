import { test, expect } from 'bun:test';
import { addLocalMask, deleteLocalMask, maskIndices, maskSize, setMaskSize } from './local-masks';
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
	expect(scaleEditSettings(parsed, 50).Locallab.Expcomp_0).toBe(.75);
	expect(scaleEditSettings(parsed, 0).Locallab.Enabled).toBe(false);
	deleteLocalMask(parsed, 0);
	expect(parsed.Locallab.Enabled).toBe(false);
});
