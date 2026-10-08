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
	for (const [chapter, fields] of Object.entries(pp3)) {
		if (chapter === 'Vibrance' || chapter === 'Local_Contrast') {
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
