import { readdir, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { env } from '$env/dynamic/private';
import { developCacheRoot } from './develop-cache';

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
/** A render's working folder: `<input file>-<uuid>`, holding only the profile and maybe the JPEG. */
const RENDER_DIR = new RegExp(`^.+\\.tif-${UUID}$`);
/** Full-size TIFFs older versions developed for every export and could leave behind. */
const EXPORT_TIFF_DIR = new RegExp(`-export-tiff(-${UUID})?$`);
const BUILD_DIR = /^\.build-/;
const RENDER_FILES = new Set(['edit.pp3', 'edited.jpg']);

/** Anything younger may still belong to a render that is running right now. */
const MIN_AGE_MS = 60 * 60 * 1000;

async function staleDirectory(path: string, now: number): Promise<boolean> {
	try {
		const info = await stat(path);
		return info.isDirectory() && now - info.mtimeMs > MIN_AGE_MS;
	} catch {
		return false;
	}
}

async function listing(path: string): Promise<string[]> {
	try {
		return await readdir(path);
	} catch {
		return [];
	}
}

function namedLikeLeftover(name: string, inDevelopCache: boolean): boolean {
	return inDevelopCache ? BUILD_DIR.test(name) : RENDER_DIR.test(name) || EXPORT_TIFF_DIR.test(name);
}

/** Whether a folder in `TMP_DIR` or the develop cache is safe to delete, given its name and contents. */
export function isLeftover(name: string, contents: string[], inDevelopCache: boolean): boolean {
	if (inDevelopCache) return BUILD_DIR.test(name);
	if (RENDER_DIR.test(name)) return contents.every((file) => RENDER_FILES.has(file));
	if (EXPORT_TIFF_DIR.test(name)) return contents.every((file) => file.endsWith('.tif') || file.endsWith('.pp3'));
	return false;
}

/**
 * Removes working folders that crashed or older renders left behind. Editor TIFFs (`*-tiff-<uuid>`),
 * cached develop bases and anything unrecognised are never touched.
 */
export async function sweepTemporaryFiles(now = Date.now()): Promise<{ removed: number }> {
	let removed = 0;
	const roots: [string, boolean][] = [];
	if (env.TMP_DIR) roots.push([env.TMP_DIR, false]);
	roots.push([developCacheRoot(), true]);

	for (const [root, inDevelopCache] of roots) {
		for (const name of await listing(root)) {
			const path = join(root, name);
			if (!namedLikeLeftover(name, inDevelopCache)) continue;
			if (!(await staleDirectory(path, now))) continue;
			if (!isLeftover(name, await listing(path), inDevelopCache)) continue;
			await rm(path, { recursive: true, force: true }).then(
				() => removed++,
				(cause) => console.error(`[tmp-sweep] Could not remove ${path}:`, cause)
			);
		}
	}
	if (removed) console.log(`[tmp-sweep] Removed ${removed} leftover temporary folders`);
	return { removed };
}
