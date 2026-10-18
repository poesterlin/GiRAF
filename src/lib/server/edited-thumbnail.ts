import { dirname, join } from 'node:path';
import { mkdir, rename, rm } from 'node:fs/promises';
import sharp from 'sharp';
import { parsePP3, stringifyPP3 } from '$lib/pp3-utils';
import { editImage } from './image-editor';
import type { Image, Snapshot } from './db/schema';

let queue: Promise<void> = Promise.resolve();
const pending = new Map<number, number>();
const scheduled = new Set<string>();

export function editedThumbnailPath(image: Image, snapshotId: number) {
	return join(dirname(image.tifPath!), 'edited-thumbnails', `${image.id}-${image.version}-${snapshotId}.webp`);
}

/** Saves are durable before this best-effort, serialized background render. */
export function queueEditedThumbnail(image: Image, snapshot: Snapshot): void {
	if (!image.tifPath) return;
	const target = editedThumbnailPath(image, snapshot.id);
	if (scheduled.has(target)) return;
	scheduled.add(target);
	pending.set(image.id, snapshot.id);
	queue = queue.then(async () => {
		if (pending.get(image.id) !== snapshot.id) return;
		pending.delete(image.id);
		if (await Bun.file(target).exists()) return;
		let output: string | undefined;
		const temporary = `${target}.${crypto.randomUUID()}.tmp`;
		try {
			const pp3 = parsePP3(snapshot.pp3);
			pp3.Resize = { Enabled: true, AppliesTo: 'Cropped area', Method: 'Lanczos', DataSpecified: 3, Width: 600, Height: 600, LongEdge: 600, ShortEdge: 600, AllowUpscaling: false };
			output = await editImage(image.tifPath!, stringifyPP3(pp3), { quality: 85, background: true });
			await mkdir(dirname(target), { recursive: true });
			await sharp(output).resize({ width: 600, height: 600, fit: 'inside', withoutEnlargement: true }).webp({ quality: 80 }).toFile(temporary);
			await rename(temporary, target);
		} finally {
			await rm(temporary, { force: true });
			if (output) await rm(dirname(output), { recursive: true, force: true });
		}
	}).catch((error) => console.error(`[edited-thumbnail] Image ${image.id}, snapshot ${snapshot.id}:`, error))
		.finally(() => scheduled.delete(target));
}
