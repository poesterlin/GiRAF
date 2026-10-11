import { error, json, type RequestHandler } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { mkdir, readFile, readdir, writeFile, rename, unlink, link } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { uploadFiles } from '$lib/server/upload';

const CHUNK_SIZE = 256 * 1024;
const MAX_FILE_SIZE = 512 * 1024 * 1024;
const finishing = new Map<string, Promise<Response>>();

function directory(hash: string | undefined) {
	if (!hash || !/^[a-f0-9]{64}$/.test(hash)) error(400, 'Invalid SHA-256');
	if (!env.IMPORT_DIR) error(500, 'IMPORT_DIR not configured');
	return join(env.IMPORT_DIR, '.resumable', hash);
}

export const GET: RequestHandler = async ({ params }) => {
	const dir = directory(params.hash);
	await mkdir(dir, { recursive: true });
	try {
		return json({ complete: true, result: JSON.parse(await readFile(join(dir, 'result.json'), 'utf8')) });
	} catch (e) {
		if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
	}
	const chunks = (await readdir(dir)).filter((name) => /^\d+$/.test(name)).map(Number);
	return json({ complete: false, chunks, chunkSize: CHUNK_SIZE });
};

export const PUT: RequestHandler = async ({ params, url, request }) => {
	const dir = directory(params.hash);
	const index = Number(url.searchParams.get('chunk'));
	if (!Number.isSafeInteger(index) || index < 0 || index >= MAX_FILE_SIZE / CHUNK_SIZE || !url.searchParams.has('chunk')) error(400, 'Invalid chunk');
	const parts: Uint8Array[] = [];
	let size = 0;
	if (!request.body) error(400, 'Missing chunk');
	const reader = request.body.getReader();
	for (;;) {
		const { value, done } = await reader.read();
		if (done) break;
		size += value.length;
		if (size > CHUNK_SIZE) {
			await reader.cancel();
			error(413, 'Chunk too large');
		}
		parts.push(value);
	}
	if (!size) error(400, 'Empty chunk');
	const bytes = Buffer.concat(parts);
	if (createHash('sha256').update(bytes).digest('hex') !== request.headers.get('x-chunk-sha256')) error(400, 'Chunk checksum mismatch');
	await mkdir(dir, { recursive: true });
	const temporary = join(dir, `${index}-${randomUUID()}.tmp`);
	try {
		await writeFile(temporary, bytes);
		try {
			await link(temporary, join(dir, String(index)));
		} catch (e) {
			if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
			if (!(await readFile(join(dir, String(index)))).equals(bytes)) error(409, 'Chunk conflict');
		}
	} finally {
		await unlink(temporary).catch(() => {});
	}
	return json({ ok: true });
};

export const POST: RequestHandler = async ({ params, request }) => {
	const dir = directory(params.hash);
	const hash = params.hash!;
	const { name, size } = await request.json();
	if (typeof name !== 'string' || !name || !Number.isSafeInteger(size) || size <= 0 || size > MAX_FILE_SIZE) error(400, 'Invalid file metadata');
	const run = async () => {
		try {
			return json(JSON.parse(await readFile(join(dir, 'result.json'), 'utf8')));
		} catch (e) {
			if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
		}
		const chunks: Buffer[] = [];
		for (let i = 0; i < Math.ceil(size / CHUNK_SIZE); i++) {
			try {
				chunks.push(await readFile(join(dir, String(i))));
			} catch (e) {
				if ((e as NodeJS.ErrnoException).code === 'ENOENT') error(409, 'Missing chunks');
				throw e;
			}
		}
		const bytes = Buffer.concat(chunks);
		if (bytes.length !== size || createHash('sha256').update(bytes).digest('hex') !== params.hash) error(409, 'File checksum mismatch');
		const response = await uploadFiles([new File([bytes], name)]);
		const result = await response.clone().json();
		if (result.results?.[0]?.status !== 'error') {
			const receipt = join(dir, `${randomUUID()}.tmp`);
			await writeFile(receipt, JSON.stringify(result));
			await rename(receipt, join(dir, 'result.json'));
			await Promise.all(chunks.map((_, i) => unlink(join(dir, String(i))).catch(() => {})));
		}
		return response;
	};
	let pending = finishing.get(hash);
	if (!pending) {
		pending = run().finally(() => finishing.delete(hash));
		finishing.set(hash, pending);
	}
	return (await pending).clone();
};
