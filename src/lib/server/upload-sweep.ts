import { readdir, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { env } from '$env/dynamic/private';

const HOUR = 60 * 60 * 1000;

/** A finished upload keeps its receipt this long, so a client retrying the same file gets the same answer. */
const RECEIPT_MS = 30 * 24 * HOUR;
/** A chunk still being written is never this old. */
const TEMP_CHUNK_MS = HOUR;

/** How long an unfinished upload may wait for its client to resume it (UPLOAD_RESUME_HOURS, default 4). */
function resumeWindowMs(): number {
	const hours = Number(env.UPLOAD_RESUME_HOURS);
	return (Number.isFinite(hours) && hours > 0 ? hours : 4) * HOUR;
}

export type UploadFolder = { files: { name: string; mtimeMs: number }[]; mtimeMs: number };

/**
 * What to remove from one resumable upload folder: the whole folder, a few leftover files, or nothing.
 * A finished upload is a folder with result.json; an unfinished one holds numbered chunks.
 */
export function uploadLeftovers(folder: UploadFolder, now: number, resumeMs = resumeWindowMs()): 'folder' | string[] {
	const receipt = folder.files.find((file) => file.name === 'result.json');
	if (receipt) return now - receipt.mtimeMs > RECEIPT_MS ? 'folder' : [];
	const lastActivity = Math.max(folder.mtimeMs, ...folder.files.map((file) => file.mtimeMs));
	if (now - lastActivity > resumeMs) return 'folder';
	return folder.files.filter((file) => file.name.endsWith('.tmp') && now - file.mtimeMs > TEMP_CHUNK_MS).map((file) => file.name);
}

/** Removes abandoned partial uploads, old receipts and stray chunk files from IMPORT_DIR/.resumable. */
export async function sweepUploads(now = Date.now()): Promise<{ folders: number; files: number }> {
	const removed = { folders: 0, files: 0 };
	if (!env.IMPORT_DIR) return removed;
	const root = join(env.IMPORT_DIR, '.resumable');
	let hashes: string[];
	try {
		hashes = await readdir(root);
	} catch {
		return removed;
	}
	for (const hash of hashes) {
		// Only folders the resumable upload route created
		if (!/^[a-f0-9]{64}$/.test(hash)) continue;
		const path = join(root, hash);
		try {
			const info = await stat(path);
			if (!info.isDirectory()) continue;
			const files = await Promise.all((await readdir(path)).map(async (name) => ({ name, mtimeMs: (await stat(join(path, name))).mtimeMs })));
			const leftovers = uploadLeftovers({ files, mtimeMs: info.mtimeMs }, now);
			if (leftovers === 'folder') {
				await rm(path, { recursive: true, force: true });
				removed.folders++;
			} else {
				for (const name of leftovers) await rm(join(path, name), { force: true });
				removed.files += leftovers.length;
			}
		} catch (cause) {
			// A folder the upload route is writing right now can change underneath; the next run retries
			console.error(`[upload-sweep] Could not check ${path}:`, cause);
		}
	}
	if (removed.folders || removed.files) console.log(`[upload-sweep] Removed ${removed.folders} upload folders and ${removed.files} stray chunk files`);
	return removed;
}
