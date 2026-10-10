import { createGroupedDocument } from './adjustment-groups';
import type { PP3Document } from './pp3-document';
import type { PP3 } from './pp3-utils';
import { curveSamples, readToneCurve, writeToneCurve } from './tone-curve';

export interface StrengthWhiteBalance {
	temperature?: number | null;
	green?: number | null;
}

export function normalizeEditStrength(value: number): number {
	return Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 100;
}

/** Parameter interpolation, never pixel blending. Geometry and retouching are untouched. */
export function scaleEditSettings(settings: PP3, percent: number, whiteBalance: StrengthWhiteBalance = {}): PP3 {
	const result = structuredClone(settings);
	const strength = normalizeEditStrength(percent) / 100;
	if (strength === 1) return result;
	const amounts: Record<string, string[]> = {
		Exposure: ['Compensation', 'Brightness', 'Contrast', 'Saturation', 'Black', 'HighlightCompr', 'ShadowCompr'],
		'Shadows_&_Highlights': ['Highlights', 'Shadows'],
		Vibrance: ['Pastels', 'Saturated'],
		Local_Contrast: ['Amount'],
		Dehaze: ['Strength'],
		PCVignette: ['Strength'],
		Film_Simulation: ['Strength'],
		Sharpening: ['Amount']
	};
	// These PP3 fields are read with Glib::KeyFile::get_integer by RawTherapee.
	const integerAmounts: Record<string, readonly string[]> = {
		Exposure: ['Brightness', 'Contrast', 'Saturation', 'Black', 'HighlightCompr', 'ShadowCompr'],
		'Shadows_&_Highlights': ['Highlights', 'Shadows'],
		Vibrance: ['Pastels', 'Saturated'],
		Dehaze: ['Strength'],
		Film_Simulation: ['Strength'],
		Sharpening: ['Amount']
	};
	for (const [chapter, fields] of Object.entries(amounts)) {
		for (const field of fields) {
			const value = result[chapter]?.[field];
			if (typeof value === 'number' && Number.isFinite(value)) {
				const scaled = value * strength;
				result[chapter][field] = integerAmounts[chapter]?.includes(field) ? Math.round(scaled) : scaled;
			}
		}
	}
	for (const field of ['Curve', 'Curve2']) {
		if (result.Exposure?.[field] === undefined) continue;
		const points = readToneCurve(result.Exposure[field]);
		if (strength === 0) result.Exposure[field] = '0;';
		else if (points) {
			// RT holds the endpoint output outside the control-point domain. Sample
			// that full function before interpolation, so those tails also fade to identity.
			const fullRange = points[0].x > 0 || points[points.length - 1].x < 1 ? curveSamples(points) : points;
			result.Exposure[field] = writeToneCurve(fullRange.map(({ x, y }) => ({ x, y: x + strength * (y - x) })));
		}
	}
	for (const field of ['HCurve', 'SCurve', 'VCurve']) {
		const curve = result.HSV_Equalizer?.[field];
		if (curve === undefined) continue;
		const values = String(curve).split(';').filter(Boolean).map(Number);
		if (strength === 0) result.HSV_Equalizer[field] = '0;';
		else if (values[0] === 1 && values.length >= 5 && (values.length - 1) % 4 === 0 && values.every(Number.isFinite)) {
			for (let i = 2; i < values.length; i += 4) values[i] = 0.5 + strength * (values[i] - 0.5);
			result.HSV_Equalizer[field] = `${values.join(';')};`;
		}
	}
	for (const [row, field] of ['Red', 'Green', 'Blue'].entries()) {
		const value = result.Channel_Mixer?.[field];
		if (typeof value !== 'string') continue;
		const values = value.split(';').filter(Boolean).map(Number);
		if (values.length !== 3 || !values.every(Number.isFinite)) continue;
		// The editor's modern PP3 calibration matrix uses 1000 on the diagonal.
		const identity = Number(result.Version?.Version ?? 338) < 338 ? 100 : 1000;
		result.Channel_Mixer[field] = `${values.map((value, column) => {
			const neutral = row === column ? identity : 0;
			return Math.round(neutral + strength * (value - neutral));
		}).join(';')};`;
	}
	const wb = result.White_Balance;
	if (wb?.Setting === 'Custom' && wb.Enabled !== false) {
		const temperature = Number(wb.Temperature);
		const green = Number(wb.Green);
		const baseTemperature = whiteBalance.temperature;
		const baseGreen = whiteBalance.green;
		// Temperature interpolates in reciprocal Kelvin (mired); tint is a multiplier.
		if (baseTemperature && baseTemperature > 0 && temperature > 0 && Number.isFinite(temperature)) {
			wb.Temperature = Math.round(1 / ((1 - strength) / baseTemperature + strength / temperature));
		}
		if (baseGreen && baseGreen > 0 && green > 0 && Number.isFinite(green)) {
			wb.Green = Math.exp((1 - strength) * Math.log(baseGreen) + strength * Math.log(green));
		}
	}
	if (strength === 0) {
		if (result.Exposure) result.Exposure.Auto = false;
		if (wb) wb.Setting = 'Camera';
		for (const chapter of ['Shadows_&_Highlights', 'Vibrance', 'Local_Contrast', 'Dehaze', 'PCVignette', 'Film_Simulation', 'Sharpening', 'HSV_Equalizer', 'Channel_Mixer']) {
			if (result[chapter]) result[chapter].Enabled = false;
		}
	}
	return result;
}

/** Store effective render settings in the PP3 body and retain editable values in metadata. */
export function createEditDocument(settings: PP3, disabledGroups: string[], percent = 100, whiteBalance: StrengthWhiteBalance = {}): PP3Document {
	const document = createGroupedDocument(settings, disabledGroups);
	const editStrength = normalizeEditStrength(percent);
	if (editStrength !== 100) {
		document.settings = scaleEditSettings(document.settings, editStrength, whiteBalance);
		document.ui!.savedValues = structuredClone(settings);
	}
	document.ui!.editStrength = editStrength;
	return document;
}
