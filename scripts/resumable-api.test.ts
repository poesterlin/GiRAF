import { test, expect, mock } from 'bun:test';
import { mkdtemp, rm, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

const root = await mkdtemp('/tmp/opencode/raw-api-');
let received: Buffer | undefined;
let uploads = 0;
mock.module('$env/dynamic/private', () => ({ env: { IMPORT_DIR: root } }));
mock.module('$lib/server/upload', () => ({
	uploadFiles: async (files: File[]) => {
		uploads++;
		received = Buffer.from(await files[0].arrayBuffer());
		return Response.json({ results: [{ status: 'success', id: 1 }] });
	}
}));
const { GET, PUT, POST } = await import('../src/routes/api/imports/resumable/[hash]/+server');
const digest = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');

test('resumable API verifies chunks, survives retries, finalizes once, and keeps completion receipt', async () => {
	const bytes = Buffer.alloc(300_000, 7);
	const hash = digest(bytes);
	const invoke = async (method: 'GET' | 'PUT' | 'POST', body?: BodyInit, chunk?: number, checksum?: string) => {
		const url = new URL(`http://localhost/api/imports/resumable/${hash}${chunk === undefined ? '' : `?chunk=${chunk}`}`);
		const request = new Request(url, { method, body, headers: checksum ? { 'x-chunk-sha256': checksum } : {} });
		return { GET, PUT, POST }[method]({ params: { hash }, url, request } as Parameters<typeof GET>[0]);
	};
	try {
		expect(await (await invoke('GET')).json()).toMatchObject({ complete: false, chunks: [] });
		await expect(invoke('PUT', bytes.subarray(0, 256 * 1024), 0, 'bad')).rejects.toMatchObject({ status: 400 });
		await expect(invoke('PUT', bytes, 0, digest(bytes))).rejects.toMatchObject({ status: 413 });
		await expect(invoke('POST', JSON.stringify({ name: 'photo.nef', size: bytes.length }))).rejects.toMatchObject({ status: 409 });
		for (let i = 0; i < 2; i++) {
			const part = bytes.subarray(i * 256 * 1024, (i + 1) * 256 * 1024);
			await invoke('PUT', part, i, digest(part));
			await invoke('PUT', part, i, digest(part));
		}
		expect((await (await invoke('GET')).json()).chunks.sort()).toEqual([0, 1]);
		const metadata = JSON.stringify({ name: 'photo.nef', size: bytes.length });
		await Promise.all([invoke('POST', metadata), invoke('POST', metadata)]);
		await invoke('POST', metadata);
		expect(uploads).toBe(1);
		expect(received).toEqual(bytes);
		expect((await (await invoke('GET')).json()).complete).toBe(true);
		expect(await readdir(join(root, '.resumable', hash))).toEqual(['result.json']);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});
