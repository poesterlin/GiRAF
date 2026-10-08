import { expect, test } from 'bun:test';
import { parsePP3, stringifyPP3 } from './pp3-utils';
import { supportsWasmPreview } from './preview-parity-policy';

test('color curves and calibration precision survive snapshot round trips', () => {
	const settings = {
		HSV_Equalizer: { Enabled: true, HCurve: '1;0;0.6;0.35;0.35;0.5;0.5;0.35;0.35;' },
		Color_Management: { Redx: 0.7347, Bluy: 0.0001, Wprim: 'cus' }
	};
	expect(parsePP3(stringifyPP3(settings))).toEqual(settings);
});

test('active color tools use reference previews while disabled tools stay eligible', () => {
	for (const chapter of ['HSV_Equalizer', 'ColorToning']) {
		expect(supportsWasmPreview(stringifyPP3({ [chapter]: { Enabled: true } }))).toBe(false);
		expect(supportsWasmPreview(stringifyPP3({ [chapter]: { Enabled: false } }))).toBe(true);
	}
	expect(supportsWasmPreview('[Color Management]\nWprim=cus\nRedx=0.7347')).toBe(false);
});
