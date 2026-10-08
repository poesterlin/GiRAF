import { expect, test } from 'bun:test';
import { prepareUploadSource } from './upload-source';
import { fingerprintFile } from './upload-duplicates';
import { createHash } from 'node:crypto';

test('snapshot survives loss of camera access and preserves upload bytes and metadata', async () => {
	const bytes = new Uint8Array([1, 5, 8, 13]);
	const file = new File([bytes], 'camera.RAF', { type: 'application/octet-stream', lastModified: 1234 });
	let reads = 0;
	const read = file.arrayBuffer.bind(file);
	file.arrayBuffer = () => {
		reads++;
		return read();
	};
	const source = await prepareUploadSource(file);
	file.arrayBuffer = async () => {
		throw new Error('Camera disconnected');
	};
	expect(await fingerprintFile(source)).toBe(createHash('sha256').update(bytes).digest('hex'));
	expect(new Uint8Array(await source.arrayBuffer())).toEqual(bytes);
	expect([source.name, source.type, source.lastModified]).toEqual([file.name, file.type, file.lastModified]);
	expect(reads).toBe(1);
});

test('camera reads are serialized and a failed read does not block subsequent files', async () => {
	let active = 0,
		peak = 0;
	const files = [0, 1, 2].map((i) => {
		const file = new File(['photo'], `${i}.RAF`);
		file.arrayBuffer = async () => {
			active++;
			peak = Math.max(peak, active);
			await new Promise((resolve) => setTimeout(resolve, 5));
			active--;
			if (i === 1) throw new Error('Read failed');
			return new ArrayBuffer(5);
		};
		return file;
	});
	const results = await Promise.allSettled(files.map(prepareUploadSource));
	expect(peak).toBe(1);
	expect(results.map((result) => result.status)).toEqual(['fulfilled', 'rejected', 'fulfilled']);
});

test('oversized RAWs retain streaming upload rather than buffering the entire source', async () => {
	const file = new File(['placeholder'], 'large.RAF');
	Object.defineProperty(file, 'size', { value: 65 * 1024 * 1024 });
	file.arrayBuffer = async () => {
		throw new Error('Must not buffer oversized source');
	};
	expect(await prepareUploadSource(file)).toBe(file);
});
