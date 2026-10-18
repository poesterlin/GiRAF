import type { PP3 } from './pp3-utils';

export type ExportSettings = {
	/** JPEG quality from 1 to 100. */
	quality: number;
	/** Longest side in pixels, or 0 to keep the full size. */
	longEdge: number;
};

export const defaultExportSettings: ExportSettings = { quality: 90, longEdge: 0 };

export const MAX_EXPORT_LONG_EDGE = 20000;

export const exportSettingKeys = { quality: 'export_quality', longEdge: 'export_long_edge' } as const;

/** Reads settings as stored (strings, possibly missing or hand-edited) and falls back per field. */
export function parseExportSettings(raw: Partial<Record<keyof ExportSettings, string | null | undefined>>): ExportSettings {
	const quality = Number(raw.quality);
	const longEdge = Number(raw.longEdge);
	return {
		quality: Number.isInteger(quality) && quality >= 1 && quality <= 100 ? quality : defaultExportSettings.quality,
		longEdge: Number.isInteger(longEdge) && longEdge >= 0 && longEdge <= MAX_EXPORT_LONG_EDGE ? longEdge : defaultExportSettings.longEdge
	};
}

/** Identifies the output the settings produce, so a session is exported again after they change. */
export function exportSettingsKey(settings: ExportSettings): string {
	return `${settings.quality}:${settings.longEdge}`;
}

/** Adds the export size and post-resize sharpening to an edit. */
export function applyExportSettings(pp3: PP3, settings: ExportSettings): PP3 {
	if (!settings.longEdge) return pp3;
	return withPostResizeSharpening(withLongEdge(pp3, settings.longEdge));
}

/**
 * RawTherapee's post-resize sharpening at its own defaults. Shrinking a photo for export is where
 * it loses crispness, and this is the sharpening RawTherapee provides for exactly that: it runs
 * after the resize, so it cannot be softened again by one. Full-size exports get nothing, because
 * the photo's own Sharpening already ran.
 */
export const postResizeSharpening = {
	Enabled: true,
	Method: 'rld',
	Contrast: 15,
	Radius: 0.5,
	Amount: 200,
	Threshold: '20;80;2000;1200;',
	OnlyEdges: false,
	EdgedetectionRadius: 1.9,
	EdgeTolerance: 1800,
	HalocontrolEnabled: false,
	HalocontrolAmount: 85,
	DeconvRadius: 0.45,
	DeconvAmount: 100,
	DeconvDamping: 0,
	DeconvIterations: 100
};

/** A moderate sharpen for a resized export, leaving whatever the photo already had alone. */
export function withPostResizeSharpening(pp3: PP3): PP3 {
	return { ...pp3, PostResizeSharpening: { ...postResizeSharpening } };
}

/** Shrinks a render to `longEdge` pixels. Resizing applies after the crop, so the long edge is the cropped photo's. */
export function withLongEdge(pp3: PP3, longEdge: number): PP3 {
	return {
		...pp3,
		Resize: {
			Enabled: true,
			AppliesTo: 'Cropped area',
			Method: 'Lanczos',
			DataSpecified: 3,
			Width: longEdge,
			Height: longEdge,
			LongEdge: longEdge,
			ShortEdge: longEdge,
			AllowUpscaling: false
		}
	};
}
