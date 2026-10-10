import { expect, test } from 'bun:test';
import { lutPreviewSettings, lutPreviewUrl } from './lut-preview';
import { fromBase64, parsePP3, type PP3 } from './pp3-utils';

test('LUT candidates respect bypassed adjustments and enable the selected look without mutating edits', () => {
	const settings: PP3 = {
		Exposure: { Compensation: 2, Curve2: '1;0;0;0.5;0.8;1;1;' },
		Film_Simulation: { Enabled: false, ClutFilename: 'old.png', Strength: 30 },
		Channel_Mixer: { Enabled: true, Red: '1100;0;0;' },
		PCVignette: { Enabled: true, Strength: -2 }
	};
	const result = lutPreviewSettings(settings, ['exposure', 'toneCurve', 'vignette', 'look'], '/luts/new.png');
	expect(result.Exposure.Compensation).toBe(0);
	expect(result.Exposure.Curve2).toBe('0;');
	expect(result.PCVignette.Enabled).toBe(false);
	expect(result.Channel_Mixer).toEqual(settings.Channel_Mixer);
	expect(result.Film_Simulation).toEqual({ Enabled: true, ClutFilename: '/luts/new.png', Strength: 100 });
	expect(settings.Film_Simulation.ClutFilename).toBe('old.png');
	expect(settings.Exposure.Compensation).toBe(2);
});

test('preview URLs round-trip base64 and unicode LUT filenames through query parsing', () => {
	const settings: PP3 = { Film_Simulation: { Enabled: true, ClutFilename: '/luts/夏 > film + test.png', Strength: 100 } };
	const url = new URL(lutPreviewUrl('42', settings), 'https://example.com');
	expect(url.searchParams.has('preview')).toBe(true);
	expect(parsePP3(fromBase64(url.searchParams.get('config')!))).toEqual(settings);
});
