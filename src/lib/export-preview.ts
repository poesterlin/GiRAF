/** Sizes the exporter preview is served at. A few fixed steps keep browser caches useful across devices. */
export const exportPreviewSizes = [720, 1080, 1440, 1920, 2560, 3840] as const;

/** The smallest step that still fills `pixels` device pixels, or the largest step for bigger screens. */
export function snapExportPreviewSize(pixels: number): number {
	if (!Number.isFinite(pixels)) return exportPreviewSizes[2];
	return exportPreviewSizes.find((size) => size >= pixels) ?? exportPreviewSizes[exportPreviewSizes.length - 1];
}

/** Beyond 2× density a photo looks no sharper on a phone, but costs over twice the bytes. */
const MAX_PIXEL_RATIO = 2;

/** Uses the screen rather than the window, so rotating a phone or resizing a window doesn't load every photo again. */
export function exportPreviewSizeForScreen(screenWidth: number, screenHeight: number, pixelRatio: number): number {
	const ratio = Math.min(pixelRatio || 1, MAX_PIXEL_RATIO);
	return snapExportPreviewSize(Math.ceil(Math.max(screenWidth, screenHeight) * ratio));
}
