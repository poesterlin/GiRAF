import type { PP3 } from './pp3-utils';

export const creativeDefaults: PP3 = {
	ColorToning: {
		Enabled: false,
		Method: 'Splitlr',
		Lumamode: true,
		Autosat: false,
		Strength: 100,
		Balance: 0,
		HighlightsColorSaturation: '0;40;',
		ShadowsColorSaturation: '0;220;'
	},
	'Black_&_White': {
		Enabled: false,
		Method: 'ChannelMixer',
		Auto: false,
		Setting: 'RGB-Rel',
		Filter: 'None',
		ComplementaryColors: true,
		Algorithm: 'SP',
		MixerRed: 33,
		MixerGreen: 33,
		MixerBlue: 33,
		GammaRed: 0,
		GammaGreen: 0,
		GammaBlue: 0,
		LuminanceCurve: '0;',
		BeforeCurve: '0;',
		AfterCurve: '0;'
	}
};

export type ToneRange = 'Shadows' | 'Highlights';
export function toneColor(settings: PP3, range: ToneRange) {
	const values = String(settings.ColorToning?.[`${range}ColorSaturation`] ?? creativeDefaults.ColorToning[`${range}ColorSaturation`])
		.split(';')
		.map(Number);
	return { saturation: values[0], hue: values[1] };
}

export function setToneColor(settings: PP3, range: ToneRange, hue: number, saturation: number) {
	if (!Number.isFinite(hue) || !Number.isFinite(saturation)) throw new Error('Invalid grading color');
	settings.ColorToning.Method = 'Splitlr';
	settings.ColorToning.Enabled = true;
	settings.ColorToning[`${range}ColorSaturation`] = `${Math.round(Math.max(0, Math.min(100, saturation)))};${Math.round(((hue % 360) + 360) % 360)};`;
}

export const gradingPresets = [
	{ name: 'Teal & amber', shadows: [200, 15], highlights: [40, 18] },
	{ name: 'Warm highlights', shadows: [220, 0], highlights: [45, 20] },
	{ name: 'Cool shadows', shadows: [220, 20], highlights: [40, 0] }
] as const;

export function applyGradingPreset(settings: PP3, preset: (typeof gradingPresets)[number]) {
	setToneColor(settings, 'Shadows', preset.shadows[0], preset.shadows[1]);
	setToneColor(settings, 'Highlights', preset.highlights[0], preset.highlights[1]);
	settings.ColorToning.Balance = 0;
	settings.ColorToning.Strength = 100;
	settings.ColorToning.Lumamode = true;
}

export function enableMonochromeMixer(settings: PP3) {
	Object.assign(settings['Black_&_White'], { Enabled: true, Method: 'ChannelMixer', Auto: false, Setting: 'RGB-Rel' });
}
