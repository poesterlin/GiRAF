import { expose } from 'comlink';
import { extractLocalPhotoPreview } from './local-photo-preview';
import { fingerprintFile } from './upload-duplicates';

async function getPreview(file: File) {
	const start = performance.now();
	const preview = await extractLocalPhotoPreview(file, { preferThumbnail: true });
	const extracted = performance.now();
	try {
		const blob = await (await fetch(preview.url)).blob();
		const read = performance.now();
		const bitmap = await createImageBitmap(blob);
		const timing = {
			extractMs: Math.round(extracted - start),
			readMs: Math.round(read - extracted),
			decodeMs: Math.round(performance.now() - read),
			width: bitmap.width,
			height: bitmap.height,
			sourceBytes: blob.size
		};
		try {
			if (Math.max(bitmap.width, bitmap.height) <= 480) return { blob, capturedAt: preview.capturedAt, timing };
			const scale = Math.min(1, 480 / Math.max(bitmap.width, bitmap.height));
			const canvas = new OffscreenCanvas(Math.max(1, Math.round(bitmap.width * scale)), Math.max(1, Math.round(bitmap.height * scale)));
			const context = canvas.getContext('2d');
			if (!context) throw new Error('Local preview canvas is unavailable.');
			context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
			const encodeStarted = performance.now();
			const encoded = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.75 });
			return { blob: encoded, capturedAt: preview.capturedAt, timing: { ...timing, encodeMs: Math.round(performance.now() - encodeStarted) } };
		} finally {
			bitmap.close();
		}
	} finally {
		URL.revokeObjectURL(preview.url);
	}
}

const api = { ping: () => {}, getPreview, getFingerprint: fingerprintFile };
export type LocalPreviewWorker = typeof api;
expose(api);
