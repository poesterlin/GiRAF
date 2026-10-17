import { expect, test } from 'bun:test';
import { hasPositionalEdits, sameProfile } from './redevelop';

test('tone-only edits can be re-developed', () => {
	expect(hasPositionalEdits({ Exposure: { Compensation: 1 }, Rotation: { Degree: 2 } })).toBe(false);
	expect(hasPositionalEdits({ Crop: { Enabled: false, X: 10 } })).toBe(false);
	expect(hasPositionalEdits({ Spot_removal: { Enabled: true } })).toBe(false);
	expect(hasPositionalEdits({ Locallab: { Enabled: false, Name_0: 'mask' } })).toBe(false);
});

test('crops, spots and masks pin a photo to its development', () => {
	expect(hasPositionalEdits({ Crop: { Enabled: true, X: 10, Y: 10, W: 100, H: 100 } })).toBe(true);
	expect(hasPositionalEdits({ Crop: { X: 10, Y: 10, W: 100, H: 100 } })).toBe(true);
	expect(hasPositionalEdits({ Spot_removal: { Enabled: true, Spot1: '10;10;20;20;8;0.5;1;' } })).toBe(true);
	expect(hasPositionalEdits({ Locallab: { Enabled: true, Name_0: 'mask' } })).toBe(true);
});

test('profiles compare by settings, not formatting', () => {
	const a = '[Exposure]\nAuto=true\nEnabled=true\n\n[Resize]\nWidth=1000';
	const b = '# note\n[Exposure]\nEnabled=true\nAuto=true\n[Resize]\nWidth=1000\n';
	expect(sameProfile(a, b)).toBe(true);
	expect(sameProfile(a, `${a}\n[LensProfile]\nLcMode=lfauto\n`)).toBe(false);
});
