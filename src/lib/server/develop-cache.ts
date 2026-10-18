import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readdir, rename, rm, stat, utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { env } from '$env/dynamic/private';
import { generateExportTif, importProfileFor } from './image-editor';

/**
 * Persistent cache for the full-resolution "develop base" intermediate representation.
 *
 * A develop base is the full-resolution TIFF RawTherapee produces from a RAW with the import
 * profile (camera white balance + auto exposure, no resize). It can be loaded back directly by
 * `rawtherapee-cli`, which skips RAW decode and demosaicing on every later render. We therefore
 * build it once per source RAW and reuse it for exports, high-resolution previews and thumbnails.
 *
 * The cache is keyed by the RAW path plus its mtime/size and the import profile the photo's editor
 * TIFF was developed with, so a re-imported or modified source produces a fresh base and each photo's
 * base matches the geometry it was edited on. Entries are reference counted while in use and evicted by TTL and a
 * total-size budget.
 *
 * Editor previews ask for a smaller base (PREVIEW_BASE_EDGE): every tool then runs on ~4 instead of ~26
 * megapixels, which renders a 2560px preview several times faster with no visible difference.
 */

/** Long edge of the develop base used for editor previews; exports always use the full-resolution base. */
export const PREVIEW_BASE_EDGE = 2560;

export interface DevelopBase {
	/** Absolute path to the cached TIFF. */
	path: string;
	/** Cache key, useful for logging. */
	key: string;
	/** True when the base already existed and did not need to be rendered. */
	reused: boolean;
	/** Decrements the in-use reference count. Safe to call more than once. */
	release(): void;
}

function cacheRoot(): string {
	return env.DEVELOP_CACHE_DIR || join(env.TMP_DIR || tmpdir(), 'develop-cache');
}

function maxBytes(): number {
	const parsed = Number(env.DEVELOP_CACHE_MAX_BYTES);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : 6 * 1024 ** 3;
}

function ttlMs(): number {
	const parsed = Number(env.DEVELOP_CACHE_TTL_MS);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : 7 * 24 * 60 * 60 * 1000;
}

interface Entry {
	path: string;
	key: string;
	size: number;
	refs: number;
	lastUsed: number;
	/** Source RAW the base was built from, when known. */
	source?: string;
}

const entries = new Map<string, Entry>();
const inflight = new Map<string, Promise<Entry>>();
let scanned = false;
let cachedBytes = 0;

async function touch(entry: Entry) {
	const now = Date.now();
	entry.lastUsed = now;
	try {
		await utimes(entry.path, now / 1000, now / 1000);
	} catch {
		// The file may have been removed underneath us; the next acquire rebuilds it.
	}
}

async function scan() {
	if (scanned) return;
	scanned = true;
	const root = cacheRoot();
	let names: string[];
	try {
		names = await readdir(root);
	} catch {
		return;
	}
	for (const name of names) {
		if (!name.endsWith('.tif')) continue;
		const key = name.slice(0, -'.tif'.length);
		if (entries.has(key)) continue;
		const path = join(root, name);
		try {
			const info = await stat(path);
			if (!info.isFile()) continue;
			entries.set(key, { path, key, size: info.size, refs: 0, lastUsed: info.mtimeMs });
			cachedBytes += info.size;
		} catch {
			// Ignore files that disappear during the scan.
		}
	}
}

/**
 * Drops any cached develop base derived from `rawPath`, whether or not the source still exists.
 * Called when a session is deleted so its intermediates leave with it.
 */
export async function evictDevelopBase(rawPath: string, previewTif?: string | null): Promise<void> {
	await scan();
	const keys = new Set<string>();
	try {
		const info = await stat(rawPath);
		const profile = await importProfileFor(previewTif);
		keys.add(keyFor(rawPath, info.mtimeMs, info.size, profile));
		keys.add(keyFor(rawPath, info.mtimeMs, info.size, profile, PREVIEW_BASE_EDGE));
	} catch {
		// The source is already gone; fall back to entries that recorded where they came from.
	}
	for (const [key, entry] of entries) {
		if (entry.refs > 0) continue;
		if (!keys.has(key) && entry.source !== rawPath) continue;
		entries.delete(key);
		cachedBytes -= entry.size;
		await rm(entry.path, { force: true });
	}
}

/** Drops expired and over-budget entries that are not currently in use. */
export async function pruneDevelopCache(): Promise<void> {
	await scan();
	const now = Date.now();
	const expired = now - ttlMs();

	for (const [key, entry] of entries) {
		if (entry.refs > 0) continue;
		if (entry.lastUsed > expired) continue;
		entries.delete(key);
		cachedBytes -= entry.size;
		await rm(entry.path, { force: true });
	}

	if (cachedBytes <= maxBytes()) return;

	const candidates = [...entries.values()].filter((entry) => entry.refs === 0).sort((a, b) => a.lastUsed - b.lastUsed);
	for (const entry of candidates) {
		if (cachedBytes <= maxBytes()) break;
		entries.delete(entry.key);
		cachedBytes -= entry.size;
		await rm(entry.path, { force: true });
	}
}

function keyFor(rawPath: string, mtimeMs: number, size: number, profile: string, longEdge?: number): string {
	// Full-resolution keys stay unchanged so existing cached bases remain valid.
	const variant = longEdge ? `\0${longEdge}` : '';
	return createHash('sha256').update(`${rawPath}\0${mtimeMs}\0${size}\0${profile}${variant}`).digest('hex');
}

async function loadExisting(key: string): Promise<Entry | null> {
	const path = join(cacheRoot(), `${key}.tif`);
	try {
		const info = await stat(path);
		if (!info.isFile() || info.size === 0) return null;
		const entry: Entry = { path, key, size: info.size, refs: 0, lastUsed: Date.now() };
		if (!entries.has(key)) {
			entries.set(key, entry);
			cachedBytes += entry.size;
		}
		return entries.get(key) ?? entry;
	} catch {
		return null;
	}
}

async function build(rawPath: string, key: string, profile: string, options: BuildOptions): Promise<Entry> {
	const root = cacheRoot();
	await mkdir(root, { recursive: true });
	const buildDir = join(root, `.build-${key}-${randomUUID()}`);
	try {
		const produced = await generateExportTif(rawPath, { ...options, outputDir: buildDir, profile });
		const target = join(root, `${key}.tif`);
		await rename(produced, target);
		const info = await stat(target);
		const entry: Entry = { path: target, key, size: info.size, refs: 0, lastUsed: Date.now() };
		entries.set(key, entry);
		cachedBytes += entry.size;
		return entry;
	} finally {
		await rm(buildDir, { recursive: true, force: true });
	}
}

interface BuildOptions {
	signal?: AbortSignal;
	/** Shrinks the base to this long edge; omit for full resolution. */
	longEdge?: number;
	/** Builds at low CPU priority, for imports and exports. */
	background?: boolean;
}

/**
 * Returns a cached develop base for `rawPath`, building it from the RAW on first use with the profile
 * recorded beside `previewTif` (the photo's editor TIFF).
 * Call `release()` when the render that consumes the path has finished.
 */
export async function acquireDevelopBase(rawPath: string, options: BuildOptions & { previewTif?: string | null } = {}): Promise<DevelopBase> {
	await pruneDevelopCache();
	const info = await stat(rawPath);
	const profile = await importProfileFor(options.previewTif);
	const key = keyFor(rawPath, info.mtimeMs, info.size, profile, options.longEdge);

	let entry = entries.get(key) ?? (await loadExisting(key));
	const reused = !!entry;

	if (!entry) {
		let pending = inflight.get(key);
		if (!pending) {
			const { signal, longEdge, background } = options;
			pending = build(rawPath, key, profile, { signal, longEdge, background }).finally(() => inflight.delete(key));
			inflight.set(key, pending);
		}
		entry = await pending;
	}

	options.signal?.throwIfAborted();
	entry.refs++;
	entry.source = rawPath;
	await touch(entry);

	let released = false;
	return {
		path: entry.path,
		key,
		reused,
		release() {
			if (released) return;
			released = true;
			entry!.refs = Math.max(0, entry!.refs - 1);
			entry!.lastUsed = Date.now();
		}
	};
}
