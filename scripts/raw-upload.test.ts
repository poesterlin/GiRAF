import { test, expect } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

test('compiled uploader resumes after lost chunk acknowledgement and retries transient errors', async () => {
	const dir = await mkdtemp('/tmp/opencode/raw-cli-');
	const executable = join(dir, 'raw-upload');
	const build = Bun.spawn([process.execPath, 'build', join(import.meta.dir, 'raw-upload.ts'), '--compile', '--outfile', executable], { stdout: 'pipe', stderr: 'pipe' });
	if ((await build.exited) !== 0) throw new Error(await new Response(build.stderr).text());
	const data = Buffer.alloc(300_000, 42);
	await Bun.write(join(dir, 'photo.NEF'), data);
	await Bun.write(join(dir, 'ignore.jpg'), 'jpeg');
	const chunks = new Map<number, Buffer>();
	let transient = true;
	let dropped = true;
	let complete = false;
	let finalized = 0;
	let puts = 0;
	const server = Bun.serve({
		port: 0,
		async fetch(request) {
			const url = new URL(request.url);
			if (request.method === 'GET') {
				if (transient) {
					transient = false;
					return new Response('temporary', { status: 503 });
				}
				return Response.json({ complete, chunkSize: 256 * 1024, chunks: [...chunks.keys()] });
			}
			if (request.method === 'PUT') {
				puts++;
				const bytes = Buffer.from(await request.arrayBuffer());
				expect(createHash('sha256').update(bytes).digest('hex')).toBe(request.headers.get('x-chunk-sha256')!);
				chunks.set(Number(url.searchParams.get('chunk')), bytes);
				if (dropped) {
					dropped = false;
					return new Response('lost ack', { status: 502 });
				}
				return Response.json({ ok: true });
			}
			finalized++;
			expect(Buffer.concat([...chunks.entries()].sort(([a], [b]) => a - b).map(([, bytes]) => bytes))).toEqual(data);
			complete = true;
			return Response.json({ results: [{ status: 'success' }] });
		}
	});
	try {
		for (let run = 0; run < 2; run++) {
			const process = Bun.spawn([executable, '-y', '--url', server.url.toString()], { cwd: dir, stdout: 'pipe', stderr: 'pipe' });
			const output = await new Response(process.stdout).text();
			const errors = await new Response(process.stderr).text();
			expect(await process.exited).toBe(0);
			expect(output + errors).toContain('1/1 files uploaded');
		}
		expect(puts).toBe(3);
		expect(finalized).toBe(1);
	} finally {
		server.stop(true);
		await rm(dir, { recursive: true, force: true });
	}
});
