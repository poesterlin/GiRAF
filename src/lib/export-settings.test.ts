import { expect, test } from 'bun:test';
import { applyExportSettings, defaultExportSettings, exportSettingsKey, parseExportSettings } from './export-settings';

test('stored settings fall back to defaults field by field', () => {
	expect(parseExportSettings({})).toEqual(defaultExportSettings);
	expect(parseExportSettings({ quality: '250', longEdge: '2048' })).toEqual({ quality: 90, longEdge: 2048 });
	expect(parseExportSettings({ quality: '80', longEdge: '-1' })).toEqual({ quality: 80, longEdge: 0 });
});

test('changing quality or size changes the key', () => {
	expect(exportSettingsKey({ quality: 80, longEdge: 0 })).not.toBe(exportSettingsKey({ quality: 95, longEdge: 0 }));
	expect(exportSettingsKey({ quality: 90, longEdge: 0 })).not.toBe(exportSettingsKey({ quality: 90, longEdge: 2048 }));
});

test('a long edge resizes the cropped photo without upscaling', () => {
	const pp3 = { Exposure: { Compensation: 1 } };
	expect(applyExportSettings(pp3, defaultExportSettings)).toBe(pp3);
	const resized = applyExportSettings(pp3, { quality: 90, longEdge: 2048 });
	expect(resized.Resize).toMatchObject({ Enabled: true, AppliesTo: 'Cropped area', LongEdge: 2048, AllowUpscaling: false });
	expect(resized.Exposure).toEqual({ Compensation: 1 });
	expect(pp3).not.toHaveProperty('Resize');
});

test('any whole long edge up to the maximum is accepted', () => {
	expect(parseExportSettings({ quality: '90', longEdge: '1234' }).longEdge).toBe(1234);
	expect(parseExportSettings({ quality: '90', longEdge: '20001' }).longEdge).toBe(0);
	expect(parseExportSettings({ quality: '90', longEdge: '12.5' }).longEdge).toBe(0);
});
