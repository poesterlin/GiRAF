import { createEditDocument, type StrengthWhiteBalance } from './edit-strength';
import { setLut, toBase64, type PP3 } from './pp3-utils';

/** Selecting a look enables its group; previews must use that same effective state. */
export function lutPreviewSettings(settings: PP3, disabledGroups: string[], path: string, percent = 100, whiteBalance: StrengthWhiteBalance = {}): PP3 {
	const candidate = setLut(structuredClone(settings), path);
	return createEditDocument(
		candidate,
		disabledGroups.filter((group) => group !== 'look'),
		percent,
		whiteBalance
	).settings;
}

/** Tiles are at most a few hundred pixels wide, so they ask for a small, low-priority render. */
export const TILE_RENDER_SIZE = 480;

export function lutPreviewUrl(imageId: string, settings: PP3): string {
	return `/api/images/${encodeURIComponent(imageId)}/edit?preview&size=${TILE_RENDER_SIZE}&config=${encodeURIComponent(toBase64(settings))}`;
}
