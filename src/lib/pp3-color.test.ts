import { expect, test } from 'bun:test';
import { parsePP3, stringifyPP3 } from './pp3-utils';

test('color curves and calibration precision survive snapshot round trips', () => {
	const settings = {
		HSV_Equalizer: { Enabled: true, HCurve: '1;0;0.6;0.35;0.35;0.5;0.5;0.35;0.35;' },
		Color_Management: { Redx: 0.7347, Bluy: 0.0001, Wprim: 'cus' }
	};
	expect(parsePP3(stringifyPP3(settings))).toEqual(settings);
});
