import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { fingerprintFile, checkUploadDuplicates } from './upload-duplicates';

test('streamed fingerprint identifies renamed duplicates across chunk boundaries', async () => {
	const bytes = new Uint8Array(2 * 1024 * 1024 + 97);
	for (let i = 0; i < bytes.length; i++) bytes[i] = i % 251;
	const first = new File([bytes], 'original.RAF');
	const renamed = new File([bytes], 'renamed.RAF');
	const expected = createHash('sha256').update(bytes).digest('hex');
	expect(await fingerprintFile(first)).toBe(expected);
	expect(await fingerprintFile(renamed)).toBe(expected);
	bytes[bytes.length - 1] ^= 1;
	expect(await fingerprintFile(new File([bytes], 'original.RAF'))).not.toBe(expected);
});

test('fingerprinting reads bounded slices and reuses the result for upload', async () => {
	const file = new File([new Uint8Array(3 * 1024 * 1024 + 12)], 'large.RAF');
	const slice = file.slice.bind(file);
	let largestRead = 0;
	let reads = 0;
	file.arrayBuffer = async () => {
		throw new Error('Whole-file read forbidden');
	};
	file.slice = (start, end, type) => {
		reads++;
		const chunk = slice(start, end, type);
		largestRead = Math.max(largestRead, chunk.size);
		return chunk;
	};
	const first = await fingerprintFile(file);
	expect(largestRead).toBeLessThanOrEqual(1024 * 1024);
	expect(reads).toBe(4);
	expect(await fingerprintFile(file)).toBe(first);
	expect(reads).toBe(4);
});

test('preflight sends fingerprints only and recognizes renamed stored files', async () => {
	const original = globalThis.fetch;
	const file = new File(['sample RAW contents'], 'renamed.RAF');
	let body: { files: { key: string; name: string; size: number; sha256: string }[] } | undefined;
	globalThis.fetch = (async (input: Parameters<typeof fetch>[0], options?: RequestInit) => {
		expect(input).toBe('/api/imports/duplicates');
		body = JSON.parse(String(options?.body));
		return Response.json({ results: [{ key: '0', duplicate: true, imported: true }] });
	}) as unknown as typeof fetch;
	try {
		const results = await checkUploadDuplicates([file]);
		expect(results[0].duplicate).toBe(true);
		expect(body?.files[0]).toEqual({ key: '0', name: file.name, size: file.size, sha256: await fingerprintFile(file) });
		expect(JSON.stringify(body)).not.toContain('sample RAW contents');
	} finally {
		globalThis.fetch = original;
	}
});

test('an unavailable duplicate service prevents a successful preflight', async () => {
	const original = globalThis.fetch;
	globalThis.fetch = (async () => new Response('Unavailable', { status: 503 })) as unknown as typeof fetch;
	try {
		await expect(checkUploadDuplicates([new File(['raw'], 'photo.RAF')])).rejects.toThrow('no files have been uploaded');
	} finally {
		globalThis.fetch = original;
	}
});
