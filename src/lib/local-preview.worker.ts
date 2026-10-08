import { expose } from 'comlink';
import { extractLocalPhotoPreview } from './local-photo-preview';
import { fingerprintFile } from './upload-duplicates';

async function getPreview(file: File): Promise<{ blob: Blob; capturedAt?: Date }> {
	const preview = await extractLocalPhotoPreview(file);
	try {
		const blob = await (await fetch(preview.url)).blob();
		const bitmap = await createImageBitmap(blob);
		try {
			const scale = Math.min(1, 480 / Math.max(bitmap.width, bitmap.height));
			const canvas = new OffscreenCanvas(Math.max(1, Math.round(bitmap.width * scale)), Math.max(1, Math.round(bitmap.height * scale)));
			const context = canvas.getContext('2d');
			if (!context) throw new Error('Local preview canvas is unavailable.');
			context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
			return { blob: await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.75 }), capturedAt: preview.capturedAt };
		} finally {
			bitmap.close();
		}
	} finally {
		URL.revokeObjectURL(preview.url);
	}
}

const api = { getPreview, getFingerprint: fingerprintFile };
export type LocalPreviewWorker = typeof api;
expose(api);
