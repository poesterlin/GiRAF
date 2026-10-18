import { db } from '$lib/server/db';
import { imageTable, type Image } from '$lib/server/db/schema';
import { bmvbhash } from 'blockhash-core';
import { eq } from 'drizzle-orm';
import sharp from 'sharp';

const CONCURRENCY = 4;

async function hashPreview(path: string) {
	const { data, info } = await sharp(path, { failOn: 'none' }).rotate().resize(512, 512, { fit: 'inside' }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
	return bmvbhash({ data, width: info.width, height: info.height }, 16);
}

/**
 * Photos imported before hashing existed (or whose hashing failed) have none, so
 * they can never be recognised as similar. Fill the gaps from their previews.
 */
const inFlight = new Map<number, Promise<string | null>>();
/** Longest a page load waits for hashing; the rest finishes in the background for the next load. */
const MAX_WAIT_MS = 1500;

export async function ensurePhashes(images: Pick<Image, 'id' | 'phash' | 'previewPath'>[]) {
	const missing = images.filter((image) => !image.phash && image.previewPath);
	if (!missing.length) return;
	const done = hashMissing(missing);
	await Promise.race([done, new Promise((resolve) => setTimeout(resolve, MAX_WAIT_MS))]);
}

async function hashMissing(missing: Pick<Image, 'id' | 'phash' | 'previewPath'>[]) {
	let next = 0;
	const worker = async () => {
		while (next < missing.length) {
			const image = missing[next++];
			// Another page load may already be hashing this photo
			const pending =
				inFlight.get(image.id) ??
				(async () => {
					try {
						const hash = await hashPreview(image.previewPath!);
						await db.update(imageTable).set({ phash: hash }).where(eq(imageTable.id, image.id));
						return hash;
					} catch (error) {
						console.error(`[phash] Could not hash image ${image.id}`, error);
						return null;
					}
				})();
			inFlight.set(image.id, pending);
			try {
				// Every waiting load gets the hash on its own row, not only the one that started it
				image.phash = (await pending) ?? image.phash;
			} finally {
				inFlight.delete(image.id);
			}
		}
	};
	await Promise.all(Array.from({ length: Math.min(CONCURRENCY, missing.length) }, worker));
}
