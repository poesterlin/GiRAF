import type { PP3 } from './pp3-utils';
import type { PP3Document } from './pp3-document';

export const groupNeutralSettings: Record<string, PP3> = {
	light: { Exposure: { Auto: false, Compensation: 0, Brightness: 0, Contrast: 0, Black: 0, HighlightCompr: 0, HighlightComprThreshold: 0, ShadowCompr: 0 }, 'Shadows_&_Highlights': { Enabled: false } },
	whiteBalance: { White_Balance: { Setting: 'Camera' } },
	color: { Exposure: { Saturation: 0 }, Vibrance: { Enabled: false }, HSV_Equalizer: { Enabled: false } },
	clarity: { Local_Contrast: { Enabled: false }, Dehaze: { Enabled: false } },
	detail: { Sharpening: { Enabled: false } },
	look: { Film_Simulation: { Enabled: false }, Channel_Mixer: { Enabled: false } }
};

export function createGroupedDocument(settings: PP3, disabledGroups: string[]): PP3Document {
	const effective = structuredClone(settings);
	const savedValues: PP3 = {};
	for (const group of disabledGroups) {
		for (const [chapter, neutral] of Object.entries(groupNeutralSettings[group] ?? {})) {
			if (!effective[chapter]) continue;
			for (const [key, value] of Object.entries(neutral)) {
				if (key in settings[chapter]) {
					savedValues[chapter] ??= {};
					savedValues[chapter][key] = settings[chapter][key];
				}
				effective[chapter][key] = value;
			}
		}
	}
	return { settings: effective, comments: [], ui: { disabledGroups: [...disabledGroups], savedValues } };
}

export function restoreGroupedSettings(document: PP3Document): PP3 {
	const settings = structuredClone(document.settings);
	for (const [chapter, values] of Object.entries(document.ui?.savedValues ?? {})) {
		settings[chapter] = { ...settings[chapter], ...values };
	}
	return settings;
}
