import { exportSettingKeys, parseExportSettings, type ExportSettings } from '$lib/export-settings';
import { getAllSettings, setSetting } from './db/settings';

export async function getExportSettings(): Promise<ExportSettings> {
	const stored = await getAllSettings();
	return parseExportSettings({
		quality: stored[exportSettingKeys.quality],
		longEdge: stored[exportSettingKeys.longEdge]
	});
}

export async function saveExportSettings(settings: ExportSettings): Promise<void> {
	await setSetting(exportSettingKeys.quality, String(settings.quality));
	await setSetting(exportSettingKeys.longEdge, String(settings.longEdge));
}
