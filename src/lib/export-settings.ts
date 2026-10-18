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

/** Adds the export size to an edit. */
export function applyExportSettings(pp3: PP3, settings: ExportSettings): PP3 {
	return settings.longEdge ? withLongEdge(pp3, settings.longEdge) : pp3;
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
