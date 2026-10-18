import { expect, mock, test } from 'bun:test';

mock.module('$env/dynamic/private', () => ({ env: {} }));
mock.module('exiftool-vendored', () => ({ exiftool: {} }));

const { withImplicitSettings } = await import('./image-editor');
const { parsePP3 } = await import('$lib/pp3-utils');

test('every render removes hot pixels, even when the edit turned it off', () => {
	const rendered = parsePP3(withImplicitSettings('[Exposure]\nCompensation=0.5\n\n[Impulse Denoising]\nEnabled=false\nThreshold=20\n'));
	expect(rendered.Impulse_Denoising).toEqual({ Enabled: true, Threshold: 50 });
	expect(rendered.Exposure).toEqual({ Compensation: 0.5 });
});
