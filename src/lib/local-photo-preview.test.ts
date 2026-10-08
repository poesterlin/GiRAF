import { describe, expect, test } from 'bun:test';
import { extractLocalPhotoPreview } from './local-photo-preview';

function raf(offset = 148, length = 4, size = offset + length): File {
	const bytes = new Uint8Array(size);
	bytes.set(new TextEncoder().encode('FUJIFILMCCD-RAW '));
	const view = new DataView(bytes.buffer);
	view.setUint32(84, offset, false);
	view.setUint32(88, length, false);
	if (offset >= 92 && offset + 4 <= size) bytes.set([255, 216, 255, 217], offset);
	return new File([bytes], 'synthetic.RAF');
}

describe('local photo previews', () => {
	test('extracts Fuji big-endian JPEG range, with bounded reads only', async () => {
		const file = raf(148, 300_000, 2_000_000);
		const reads: number[] = [];
		const originalSlice = file.slice.bind(file);
		const track = (blob: Blob): Blob => {
			const slice = blob.slice.bind(blob);
			const read = blob.arrayBuffer.bind(blob);
			blob.arrayBuffer = () => {
				reads.push(blob.size);
				return read();
			};
			blob.slice = (start, end, type) => track(slice(start, end, type));
			return blob;
		};
		file.arrayBuffer = () => {
			throw new Error('Full RAW read forbidden');
		};
		file.slice = (start, end, type) => {
			return track(originalSlice(start, end, type));
		};
		const result = await extractLocalPhotoPreview(file);
		try {
			const blob = await (await fetch(result.url)).blob();
			expect(blob.type).toBe('image/jpeg');
			expect(blob.size).toBe(300_000);
			expect(new Uint8Array(await blob.slice(0, 4).arrayBuffer())).toEqual(new Uint8Array([255, 216, 255, 217]));
			expect(reads).toEqual([92, 256 * 1024]);
		} finally {
			URL.revokeObjectURL(result.url);
		}
	});

	test.each([
		[0, 4, 200],
		[148, 0, 200],
		[148, 100, 200],
		[148, 33 * 1024 * 1024, 200]
	])('rejects invalid RAF range %s/%s/%s', async (offset, length, size) => {
		await expect(extractLocalPhotoPreview(raf(offset, length, size))).rejects.toThrow('invalid offsets or size');
	});

	test('rejects unsupported, truncated and non-JPEG RAF data', async () => {
		await expect(extractLocalPhotoPreview(new File(['raw'], 'image.NEF'))).rejects.toThrow('No supported');
		await expect(extractLocalPhotoPreview(new File(['FUJIFILMCCD-RAW '], 'image.RAF'))).rejects.toThrow('Truncated');
		const file = raf();
		const corrupt = new File([file.slice(0, 148), new Uint8Array(4)], 'image.RAF');
		await expect(extractLocalPhotoPreview(corrupt)).rejects.toThrow('not a JPEG');
	});

	test.each([
		[[255, 216, 255, 217], 'image/jpeg'],
		[[137, 80, 78, 71, 13, 10, 26, 10], 'image/png']
	])('supports direct images by signature', async (bytes, type) => {
		const result = await extractLocalPhotoPreview(new File([new Uint8Array(bytes)], 'photo', { type: 'application/octet-stream' }));
		try {
			expect((await (await fetch(result.url)).blob()).type).toBe(type);
		} finally {
			URL.revokeObjectURL(result.url);
		}
	});

	test.each([true, false])('reads DateTimeOriginal with TIFF little endian = %s', async (little) => {
		const tiff = new Uint8Array(64);
		tiff.set(new TextEncoder().encode(little ? 'II' : 'MM'));
		const view = new DataView(tiff.buffer);
		view.setUint16(2, 42, little);
		view.setUint32(4, 8, little);
		view.setUint16(8, 1, little);
		view.setUint16(10, 0x8769, little);
		view.setUint16(12, 4, little);
		view.setUint32(14, 1, little);
		view.setUint32(18, 26, little);
		view.setUint16(26, 1, little);
		view.setUint16(28, 0x9003, little);
		view.setUint16(30, 2, little);
		view.setUint32(32, 20, little);
		view.setUint32(36, 44, little);
		tiff.set(new TextEncoder().encode('2024:05:06 07:08:09\0'), 44);
		const result = await extractLocalPhotoPreview(new File([new Uint8Array([255, 216, 255, 225, 0, 72]), 'Exif\0\0', tiff, new Uint8Array([255, 217])], 'photo.jpg'));
		try {
			expect(result.capturedAt).toEqual(new Date(2024, 4, 6, 7, 8, 9));
		} finally {
			URL.revokeObjectURL(result.url);
		}
	});
});
