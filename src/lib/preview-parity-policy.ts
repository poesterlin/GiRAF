import { parsePP3 } from './pp3-utils';

/**
 * The bundled native renderer has not passed the RawTherapee parity suite.
 * Keep production previews on the reference engine until representative TIFF,
 * exposure, white-balance, tint, transform and LUT cases pass practical perceptual
 * thresholds and capability tests. A successful compile alone is insufficient.
 */
export const WASM_PREVIEW_PARITY_VERIFIED = false;

export function getRequiredClutPath(pp3String: string): string | null {
	const film = parsePP3(pp3String).Film_Simulation;
	if (!film || film.Enabled === false || Number(film.Strength ?? 100) === 0) return null;
	const path = film.ClutFilename;
	return typeof path === 'string' ? path.trim() || null : null;
}
