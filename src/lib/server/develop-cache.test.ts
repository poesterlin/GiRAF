import { expect, mock, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, writeFileSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const cacheDir = mkdtempSync(join(tmpdir(), 'develop-cache-test-'));
const env: Record<string, string | undefined> = {
	DEVELOP_CACHE_DIR: cacheDir,
	DEVELOP_CACHE_MAX_BYTES: '1000000',
	DEVELOP_CACHE_TTL_MS: '60000'
};
mock.module('$env/dynamic/private', () => ({ env }));

let builds = 0;

// Stand in for the real RawTherapee call: create a small file where the base would land.
mock.module('./image-editor', () => ({
	generateExportTif: async (_imagePath: string, options: { outputDir?: string } = {}) => {
		builds++;
		const dir = options.outputDir!;
		mkdirSync(dir, { recursive: true });
		const path = join(dir, 'base.tif');
		writeFileSync(path, Buffer.alloc(64));
		return path;
	}
}));

const { acquireDevelopBase, pruneDevelopCache } = await import('./develop-cache');

function makeRaw(name: string): string {
	const path = join(cacheDir, name);
	writeFileSync(path, `raw-${name}`);
	return path;
}

test('builds the base once and reuses it', async () => {
	builds = 0;
	const raw = makeRaw('reuse.RAF');
	const first = await acquireDevelopBase(raw);
	expect(first.reused).toBe(false);
	expect(builds).toBe(1);
	expect(existsSync(first.path)).toBe(true);
	first.release();

	const second = await acquireDevelopBase(raw);
	expect(second.reused).toBe(true);
	expect(second.path).toBe(first.path);
	expect(builds).toBe(1);
	second.release();
});

test('concurrent acquires share a single build', async () => {
	builds = 0;
	const raw = makeRaw('concurrent.RAF');
	const [a, b] = await Promise.all([acquireDevelopBase(raw), acquireDevelopBase(raw)]);
	expect(builds).toBe(1);
	expect(a.path).toBe(b.path);
	a.release();
	b.release();
});

test('a changed source mtime produces a new base', async () => {
	builds = 0;
	const raw = makeRaw('reimport.RAF');
	const first = await acquireDevelopBase(raw);
	first.release();
	utimesSync(raw, new Date(Date.now() + 5000), new Date(Date.now() + 5000));
	const second = await acquireDevelopBase(raw);
	expect(builds).toBe(2);
	expect(second.path).not.toBe(first.path);
	second.release();
});

test('a missing source rejects', async () => {
	await expect(acquireDevelopBase(join(cacheDir, 'missing.RAF'))).rejects.toThrow();
});

test('release is idempotent and prune keeps in-use entries', async () => {
	const raw = makeRaw('pinned.RAF');
	const pinned = await acquireDevelopBase(raw);
	pinned.release();
	pinned.release();
	env.DEVELOP_CACHE_MAX_BYTES = '1';
	await pruneDevelopCache();
	expect(existsSync(pinned.path)).toBe(false);

	const held = await acquireDevelopBase(makeRaw('held.RAF'));
	await pruneDevelopCache();
	expect(existsSync(held.path)).toBe(true);
	held.release();
	env.DEVELOP_CACHE_MAX_BYTES = '1';
	await pruneDevelopCache();
	expect(existsSync(held.path)).toBe(false);
});
