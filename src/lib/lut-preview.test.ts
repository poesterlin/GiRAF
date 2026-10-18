import { expect, test } from 'bun:test';
import { lutPreviewSettings, lutPreviewUrl } from './lut-preview';
import { fromBase64, parsePP3, stringifyPP3, type PP3 } from './pp3-utils';

const baseline: PP3 = {
	Exposure: { Compensation: 0.4, Curve2: '0;' },
	Film_Simulation: { Enabled: false, ClutFilename: '', Strength: 100 }
};

test('a look preview is the baseline with only that look applied', () => {
	const result = lutPreviewSettings(baseline, '/luts/new.png');
	expect(result.Exposure).toEqual(baseline.Exposure);
	expect(result.Film_Simulation).toEqual({ Enabled: true, ClutFilename: '/luts/new.png', Strength: 100 });
	expect(baseline.Film_Simulation.ClutFilename).toBe('');
});

test('a look preview has one URL however the edit changes, so the browser can cache it', () => {
	const fromText = lutPreviewUrl('42', lutPreviewSettings(stringifyPP3(baseline), '/luts/new.png'));
	expect(lutPreviewUrl('42', lutPreviewSettings(stringifyPP3(baseline), '/luts/new.png'))).toBe(fromText);
	expect(lutPreviewUrl('42', lutPreviewSettings(baseline, '/luts/new.png'))).toBe(fromText);
});

test('preview URLs round-trip base64 and unicode LUT filenames through query parsing', () => {
	const settings: PP3 = { Film_Simulation: { Enabled: true, ClutFilename: '/luts/夏 > film + test.png', Strength: 100 } };
	const url = new URL(lutPreviewUrl('42', settings), 'https://example.com');
	expect(url.searchParams.has('preview')).toBe(true);
	expect(url.searchParams.get('size')).toBe('480');
	expect(parsePP3(fromBase64(url.searchParams.get('config')!))).toEqual(settings);
});
