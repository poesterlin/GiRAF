import { parsePP3, setLut, toBase64, type PP3 } from './pp3-utils';

/**
 * A look's preview is the photo as imported with only that look applied. It never changes while
 * editing, so every tile keeps one URL and the browser serves it from cache after the first time.
 */
export function lutPreviewSettings(baseline: string | PP3, path: string): PP3 {
	const settings = typeof baseline === 'string' ? parsePP3(baseline) : structuredClone(baseline);
	return setLut(settings, path);
}

/** Tiles are at most a few hundred pixels wide, so they ask for a small, low-priority render. */
export const TILE_RENDER_SIZE = 480;

export function lutPreviewUrl(imageId: string, settings: PP3): string {
	return `/api/images/${encodeURIComponent(imageId)}/edit?preview&size=${TILE_RENDER_SIZE}&config=${encodeURIComponent(toBase64(settings))}`;
}
