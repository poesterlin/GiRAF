import { readdir, rm } from 'node:fs/promises';
import { basename, dirname, join, resolve, sep } from 'node:path';
import { eq } from 'drizzle-orm';
import { env } from '$env/dynamic/private';
import { db } from './db';
import { imageTable, sessionTable, type Session } from './db/schema';
import { makeSessionPath } from './export-files';
import { evictDevelopBase } from './develop-cache';
import { importDirectories } from './import-dirs';

/**
 * True when `path` still sits inside `root`, so a stale or hostile database row can never remove a
 * file outside the directory that owns it.
 */
export function withinDirectory(root: string | undefined, path: string | null): path is string {
	if (!root || !path) return false;
	const base = resolve(root);
	const target = resolve(path);
	return target === base || target.startsWith(base + sep);
}

async function remove(path: string, recursive = false): Promise<void> {
	try {
		await rm(path, { recursive, force: true });
	} catch (cause) {
		console.error(`[session-delete] Could not remove ${path}:`, cause);
	}
}

export type SessionDeleteFiles = { imports: boolean; exports: boolean };

/**
 * Full-resolution export intermediates are named from their RAW, so one directory listing clears any
 * left behind by a crashed export. Only names belonging to this session's RAWs are touched.
 */
async function removeExportIntermediates(rawNames: Set<string>): Promise<void> {
	if (!env.TMP_DIR || !rawNames.size) return;
	let names: string[];
	try {
		names = await readdir(env.TMP_DIR);
	} catch {
		return;
	}
	for (const name of names) {
		const marker = name.lastIndexOf('-export-tiff');
		if (marker === -1 || !rawNames.has(name.slice(0, marker))) continue;
		await remove(join(env.TMP_DIR, name), true);
	}
}

/**
 * Removes a session's files. Cached previews and intermediates are always removed because they are
 * worthless once the session is gone; the imported and exported originals are only removed when the
 * caller asks, since those may be the user's only copy.
 */
export async function deleteSessionFiles(session: Session, files: SessionDeleteFiles): Promise<void> {
	const images = await db
		.select({ filepath: imageTable.filepath, previewPath: imageTable.previewPath, tifPath: imageTable.tifPath })
		.from(imageTable)
		.where(eq(imageTable.sessionId, session.id));

	const rawNames = new Set<string>();
	for (const image of images) {
		rawNames.add(basename(image.filepath));
		// The develop base is keyed off the RAW, so drop it while the source is still readable.
		await evictDevelopBase(image.filepath);
		if (withinDirectory(env.TMP_DIR, image.previewPath)) await remove(image.previewPath);
		// A per-RAW tiff directory also holds that image's edited thumbnails.
		if (withinDirectory(env.TMP_DIR, image.tifPath)) await remove(dirname(image.tifPath), true);
	}
	await removeExportIntermediates(rawNames);

	if (files.imports) {
		for (const image of images) {
			if (importDirectories(env).some((dir) => withinDirectory(dir, image.filepath))) await remove(image.filepath);
		}
	}

	if (files.exports) {
		const path = makeSessionPath(session);
		if (withinDirectory(env.EXPORT_DIR || '/app/export', path)) await remove(path, true);
	}
}

/**
 * Deletes an archived session and its records. Files are removed first so a failure leaves the rows
 * behind rather than orphaning files on disk with nothing pointing at them.
 */
export async function deleteSession(session: Session, files: SessionDeleteFiles): Promise<void> {
	await deleteSessionFiles(session, files);
	await db.delete(sessionTable).where(eq(sessionTable.id, session.id));
}
