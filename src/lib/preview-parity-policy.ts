import { parsePP3 } from './pp3-utils';

/**
 * The installed renderer passed the RT 5.12 perceptual corpus for RGB8/RGB16,
 * auto exposure, scalar color controls and supported geometry. Eligibility below
 * remains narrower than that of RawTherapee; unknown tools use the reference engine.
 */
export const WASM_PREVIEW_PARITY_VERIFIED = true;

const supportedFields: Record<string, readonly string[]> = {
	Version: ['AppVersion', 'Version'],
	Exposure: [
		'Enabled',
		'Auto',
		'Clip',
		'Compensation',
		'Brightness',
		'Contrast',
		'Saturation',
		'Black',
		'HighlightCompr',
		'HighlightComprThreshold',
		'ShadowCompr',
		'Curve',
		'Curve2'
	],
	White_Balance: ['Enabled', 'Setting', 'Temperature', 'Green', 'Equal'],
	Film_Simulation: ['Enabled', 'Strength', 'ClutFilename'],
	Rotation: ['Enabled', 'Degree'],
	Crop: ['Enabled', 'X', 'Y', 'W', 'H', 'FixedRatio', 'Ratio', 'Orientation', 'Guide'],
	Coarse_Transformation: ['Rotate', 'HorizontalFlip', 'VerticalFlip'],
	Common_Properties_for_Transformations: ['AutoFill'],
	Color_Management: ['WorkingProfile']
};

/** Capability routing is separate from visual acceptance: ignored tools cannot pass. */
export function supportsWasmPreview(pp3String: string): boolean {
	const pp3 = parsePP3(pp3String);
	// The WASM renderer has no spot-removal implementation, even for otherwise
	// supported profiles. Never silently show an unretouched local preview.
	if (pp3.Spot_removal) return false;
	for (const [chapter, fields] of Object.entries(pp3)) {
		if (chapter === 'Dehaze') {
			if (fields.Enabled === false) continue;
			// Older editor snapshots enable Dehaze at zero strength. That is a
			// no-op, but depth-map visualization and unknown options are not.
			if (Object.keys(fields).some((key) => !['Enabled', 'Strength', 'Depth', 'Saturation', 'ShowDepthMap'].includes(key))) return false;
			if (fields.Strength !== 0 || (fields.ShowDepthMap !== undefined && fields.ShowDepthMap !== false)) return false;
			continue;
		}
		if (chapter === 'Vibrance') {
			if (fields.Enabled === false) continue;
			// RT returns before processing when both controls and the skin curve
			// are neutral. Require explicit zeroes and a known identity curve.
			if (Object.keys(fields).some((key) => !['Enabled', 'Pastels', 'Saturated', 'PSThreshold', 'ProtectSkins', 'AvoidColorShift', 'PastSatTog', 'SkinTonesCurve'].includes(key))) return false;
			if (fields.Pastels !== 0 || fields.Saturated !== 0) return false;
			if (fields.SkinTonesCurve !== undefined && !['0', '0;'].includes(String(fields.SkinTonesCurve).trim())) return false;
			continue;
		}
		if (chapter === 'Channel_Mixer') {
			if (fields.Enabled === false) continue;
			if (fields.Enabled !== true || (pp3.Version?.Version !== undefined && Number(pp3.Version.Version) < 338)) return false;
			if (Object.keys(fields).some((key) => !['Enabled', 'Red', 'Green', 'Blue'].includes(key))) return false;
			// The moderate calibration subset passed the RT 5.13 corpus. Extreme
			// matrices expose output-gamut differences and remain reference-only.
			for (const [row, key] of ['Red', 'Green', 'Blue'].entries()) {
				if (typeof fields[key] !== 'string' || !/^[-+]?\d+;[-+]?\d+;[-+]?\d+;?$/.test(fields[key] as string)) return false;
				const values = String(fields[key]).split(';').slice(0, 3).map(Number);
				if (values.some((value, column) => Math.abs(value - (row === column ? 1000 : 0)) > 100)) return false;
			}
			continue;
		}
		if (chapter === 'Local_Contrast' || chapter === 'HSV_Equalizer' || chapter === 'ColorToning' || chapter === 'PCVignette') {
			if (fields.Enabled !== false) return false;
			continue;
		}
		if (chapter === 'Sharpening') {
			if (fields.Enabled !== false && (Object.keys(fields).some((key) => !['Enabled', 'Radius', 'Amount', 'Method'].includes(key)) || (fields.Method && fields.Method !== 'usm')))
				return false;
			if (fields.Enabled !== false && Number(fields.Amount ?? 0) !== 0) return false;
			continue;
		}
		if (chapter === 'FattalToneMapping') {
			if (fields.Enabled !== false) return false;
			continue;
		}
		if (chapter === 'Shadows_&_Highlights') {
			if (Object.keys(fields).some((key) => !['Enabled', 'Highlights', 'HighlightTonalWidth', 'Shadows', 'ShadowTonalWidth', 'Radius', 'Lab'].includes(key))) return false;
			if (fields.Enabled !== false && (Number(fields.Highlights ?? 0) !== 0 || Number(fields.Shadows ?? 0) !== 0)) return false;
			continue;
		}
		const allowed = supportedFields[chapter];
		if (!allowed || Object.keys(fields).some((key) => !allowed.includes(key))) return false;
	}
	if (pp3.Exposure?.Enabled === false) return false;
	if (pp3.Rotation?.Enabled === false && Number(pp3.Rotation.Degree ?? 0) !== 0) return false;
	if (pp3.White_Balance?.Setting && !['Camera', 'Custom'].includes(String(pp3.White_Balance.Setting))) return false;
	if (pp3.Color_Management?.WorkingProfile && pp3.Color_Management.WorkingProfile !== 'ProPhoto') return false;
	for (const key of ['Curve', 'Curve2']) {
		const curve = pp3.Exposure?.[key];
		if (curve !== undefined && ![0, 2].includes(Number(String(curve).split(';')[0]))) return false;
	}
	return true;
}

export function getRequiredClutPath(pp3String: string): string | null {
	const film = parsePP3(pp3String).Film_Simulation;
	if (!film || film.Enabled === false || Number(film.Strength ?? 100) === 0) return null;
	const path = film.ClutFilename;
	return typeof path === 'string' ? path.trim() || null : null;
}
