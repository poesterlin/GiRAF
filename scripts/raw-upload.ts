import * as p from '@clack/prompts';
import { parseArgs } from 'node:util';
import { readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const { values } = parseArgs({
	options: {
		url: { type: 'string' },
		yes: { type: 'boolean', short: 'y' },
		help: { type: 'boolean', short: 'h' }
	}
});
if (values.help) {
	console.log(
		'Usage: raw-upload [--url https://raw.oesterlin.dev] [-y]\nUploads RAW files in the current directory sequentially using resumable 256 KiB chunks.\nRetries connection failures indefinitely; Ctrl+C stops safely. Re-run to resume.\nOptional GIRAF_COOKIE and GIRAF_TOKEN environment variables supply authentication.'
	);
	process.exit(0);
}
const extensions =
	/\.(3fr|ari|arw|bay|braw|cap|cr2|cr3|crw|data|dcr|dcs|dng|drf|eip|erf|fff|gpr|iiq|k25|kdc|mdc|mef|mos|mrw|nef|nrw|obm|orf|pef|ptx|pxn|r3d|raf|raw|rwl|rw2|rwz|sr2|srf|srw|x3f)$/i;
const stop = new AbortController();
process.on('SIGINT', () => stop.abort());
process.on('SIGTERM', () => stop.abort());
const sleep = (ms: number) =>
	new Promise<void>((resolve, reject) => {
		if (stop.signal.aborted) return reject(new Error('Stopped'));
		const cancel = () => {
			clearTimeout(timer);
			reject(new Error('Stopped'));
		};
		const timer = setTimeout(() => {
			stop.signal.removeEventListener('abort', cancel);
			resolve();
		}, ms);
		stop.signal.addEventListener('abort', cancel, { once: true });
	});
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

async function main() {
	p.intro('GiRAF resilient RAW uploader');
	const files = (await readdir('.', { withFileTypes: true }))
		.filter((f) => f.isFile() && extensions.test(f.name))
		.map((f) => f.name)
		.sort();
	if (!files.length) {
		p.outro('No RAW files found in the current directory.');
		return;
	}
	const input =
		values.url ??
		(values.yes
			? 'https://raw.oesterlin.dev'
			: await p.text({
					message: 'GiRAF server URL',
					initialValue: 'https://raw.oesterlin.dev',
					validate: (v) => {
						try {
							const u = new URL(v!);
							if (!['https:', 'http:'].includes(u.protocol)) return 'Use an HTTP(S) URL';
						} catch {
							return 'Enter a valid URL';
						}
					}
				}));
	if (p.isCancel(input)) return;
	const base = new URL(String(input));
	if (!['https:', 'http:'].includes(base.protocol)) throw new Error('Use an HTTP(S) URL');
	if (!values.yes) {
		const confirmed = await p.confirm({ message: `Upload ${files.length} RAW files from ${process.cwd()} to ${base.origin}?` });
		if (p.isCancel(confirmed) || !confirmed) return;
	}
	const spin = p.spinner();
	let failed = 0;
	async function call(path: string, init: RequestInit = {}): Promise<any> {
		for (let attempt = 0; ; attempt++) {
			if (stop.signal.aborted) throw new Error('Stopped');
			try {
				const headers = new Headers(init.headers);
				if (process.env.GIRAF_COOKIE) headers.set('cookie', process.env.GIRAF_COOKIE);
				if (process.env.GIRAF_TOKEN) headers.set('authorization', `Bearer ${process.env.GIRAF_TOKEN}`);
				const response = await fetch(new URL(path, base), {
					...init,
					headers,
					redirect: 'error',
					timeout: false,
					signal: AbortSignal.any([stop.signal, AbortSignal.timeout(540_000)])
				});
				if (!response.ok) {
					if (![408, 425, 429].includes(response.status) && response.status < 500)
						throw Object.assign(new Error(`HTTP ${response.status}: ${(await response.text()).slice(0, 200)}`), { permanent: true });
					throw new Error(`HTTP ${response.status}`);
				}
				return await response.json();
			} catch (e) {
				if (stop.signal.aborted || (e as { permanent?: boolean }).permanent) throw e;
				const delay = Math.min(60_000, 1000 * 2 ** Math.min(attempt, 6)) * (0.75 + Math.random() * 0.5);
				spin.message(`Connection interrupted: ${String(e)} · retry ${attempt + 1} in ${Math.ceil(delay / 1000)}s`);
				await sleep(delay);
			}
		}
	}
	for (const [position, name] of files.entries()) {
		spin.start(`[${position + 1}/${files.length}] Hashing ${name}`);
		try {
			const file = Bun.file(name);
			if (!file.size || file.size > 512 * 1024 * 1024) throw new Error('RAW file must be between 1 byte and 512 MiB');
			const hasher = createHash('sha256');
			for await (const bytes of file.stream()) {
				if (stop.signal.aborted) throw new Error('Stopped');
				hasher.update(bytes);
			}
			const hash = hasher.digest('hex');
			const path = `/api/imports/resumable/${hash}`;
			const status = await call(path);
			if (!status.complete) {
				if (status.chunkSize !== 256 * 1024 || !Array.isArray(status.chunks)) throw new Error('Unsupported resumable upload protocol');
				const present = new Set<number>(status.chunks);
				const total = Math.ceil(file.size / status.chunkSize);
				for (let chunk = 0; chunk < total; chunk++) {
					if (present.has(chunk)) continue;
					spin.message(`[${position + 1}/${files.length}] ${name} · chunk ${chunk + 1}/${total} · ${Math.floor((chunk / total) * 100)}%`);
					const bytes = new Uint8Array(await file.slice(chunk * status.chunkSize, (chunk + 1) * status.chunkSize).arrayBuffer());
					await call(`${path}?chunk=${chunk}`, { method: 'PUT', headers: { 'content-type': 'application/octet-stream', 'x-chunk-sha256': sha(bytes) }, body: bytes });
				}
				spin.message(`${name} · verifying and adding to import queue`);
				const result = await call(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, size: file.size }) });
				if (!['success', 'skipped'].includes(result.results?.[0]?.status)) throw new Error(result.results?.[0]?.message ?? 'Invalid server result');
			}
			spin.stop(`${name} · ${status.complete ? 'already uploaded' : 'uploaded and verified'}`);
		} catch (e) {
			spin.stop(`${name} · ${String(e)}`);
			if (stop.signal.aborted) {
				p.outro('Stopped safely. Run again in this directory to resume.');
				process.exitCode = 130;
				return;
			}
			failed++;
		}
	}
	p.outro(`${files.length - failed}/${files.length} files uploaded. ${failed ? 'Run again to retry failed files.' : 'Ready in the GiRAF importer.'}`);
	if (failed) process.exitCode = 1;
}
main().catch((e) => {
	p.log.error(String(e));
	process.exitCode = 1;
});
