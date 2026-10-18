import { expect, test } from 'bun:test';
import { exportPreviewSizeForScreen, snapExportPreviewSize } from './export-preview';

test('phones get a phone-sized preview and large screens are capped', () => {
	// iPhone-class: 390×844 CSS pixels at 3×, treated as 2×
	expect(exportPreviewSizeForScreen(390, 844, 3)).toBe(1920);
	// Budget Android: 360×800 at 2×
	expect(exportPreviewSizeForScreen(360, 800, 2)).toBe(1920);
	expect(exportPreviewSizeForScreen(1920, 1080, 1)).toBe(1920);
	expect(exportPreviewSizeForScreen(2560, 1440, 2)).toBe(3840);
});

test('requested sizes snap to a fixed step', () => {
	expect(snapExportPreviewSize(1)).toBe(720);
	expect(snapExportPreviewSize(1081)).toBe(1440);
	expect(snapExportPreviewSize(100000)).toBe(3840);
	expect(snapExportPreviewSize(Number.NaN)).toBe(1440);
});
