import { parsePP3, stringifyPP3 } from '$lib/pp3-utils';
import { db } from '$lib/server/db';
import { editImage, generateExportTif, generateImportTif, mapCropFromPreviewToExport } from '$lib/server/image-editor';
import { bmvbhash } from 'blockhash-core';
import { and, asc, desc, eq, isNull, lt, or } from 'drizzle-orm';
import { readFile, mkdir, stat } from 'fs/promises';
import { decode } from 'jpeg-js';
import { dirname, join } from 'path';

async function fileExists(path: string) {
	try {
		return (await stat(path)).isFile();
	} catch {
		return false;
	}
}
import { imageTable, mediaTable, sessionTable, snapshotTable, albumTable, type Album, type Image, type Session } from '../db/schema';
import type { ExportPayload, ImportPayload, JobResult } from './types';
import { integrations } from '../integrations';
import { exiftool } from 'exiftool-vendored';
import { assert } from '$lib';
import { makeOutputPath, moveExportFile, findExportPath } from '../export-files';
import { calculateImportBaseline } from '../auto-exposure';
export { makeOutputPath, makeSessionPath } from '../export-files';

const SIMILARITY_THRESHOLD = 45; // Hamming distance threshold for considering images similar

function hammingDistance(hex1: string, hex2: string): number {
	if (hex1.length !== hex2.length) {
		throw new Error('Strings must have the same length');
	}

	let distance = 0;
	for (let i = 0; i < hex1.length; i++) {
		const n1 = parseInt(hex1[i], 16);
		const n2 = parseInt(hex2[i], 16);
		let xor = n1 ^ n2;
		while (xor > 0) {
			distance += xor & 1;
			xor >>= 1;
		}
	}
	return distance;
}

export async function runImport(payload: ImportPayload, signal?: AbortSignal): Promise<JobResult> {
	const { sessionId } = payload;

	const images = await db.query.imageTable.findMany({
		where: eq(imageTable.sessionId, sessionId),
		orderBy: asc(imageTable.recordedAt)
	});

	console.log(`[Executor] Starting import for session: ${sessionId}`);
	const failures: string[] = [];
	let repaired = 0;
	try {
		for (const image of images) {
			if (signal?.aborted) {
				throw new Error('Aborted');
			}

			try {
				const usable = async (path: string | null) => path ? stat(path).then((file) => file.isFile() && file.size > 0).catch((cause) => {
					if (['ENOENT', 'ENOTDIR'].includes((cause as NodeJS.ErrnoException).code ?? '')) return false;
					throw cause;
				}) : false;
				if (!(await usable(image.filepath))) throw new Error('Original RAW file is missing or empty');
				const needsTiff = !(await usable(image.tifPath)) || image.whiteBalance === null || image.tint === null;
				const needsPreview = !(await usable(image.previewPath));
				if (!needsTiff && !needsPreview && image.phash) continue;
				console.log(`[Executor] Repairing image ${image.id}: ${image.filepath}`);
				if (needsTiff) {
					const { pp3, tif } = await generateImportTif(image.filepath, { signal });
					if (!(await usable(tif))) throw new Error('Generated editor TIFF is missing or empty');
					// Save the repaired TIFF even if preview extraction subsequently fails.
					await db.update(imageTable).set({
						tifPath: tif,
						importBaseline: await calculateImportBaseline(tif, signal),
						whiteBalance: pp3.White_Balance?.Temperature as number,
						tint: pp3.White_Balance?.Green as number
					}).where(eq(imageTable.id, image.id));
				}
				const previewPath = needsPreview ? '/tmp/' + image.id + '_preview.jpg' : image.previewPath!;
				if (needsPreview) await exiftool.extractPreview(image.filepath, previewPath, { ignoreMinorErrors: true, forceWrite: true });
				const jpegData = await readFile(previewPath);
				const { width, height, data } = decode(jpegData, { useTArray: true });
				const hash = await bmvbhash({ data, width, height }, 16);
				await db.update(imageTable).set({ phash: hash, previewPath }).where(eq(imageTable.id, image.id));
				await stackSimilarImages(image, hash, sessionId);
				repaired++;
			} catch (cause) {
				if (signal?.aborted) throw cause;
				const message = `${image.name} (ID ${image.id}): ${cause instanceof Error ? cause.message : String(cause)}`;
				failures.push(message);
				console.error(`[Executor] ${message}`);
			}
		}
		console.log(`[Executor] Finished import for session: ${sessionId}.`);
		if (failures.length) return { status: 'error', message: `Checked ${images.length} photos; repaired ${repaired}; ${failures.length} could not be processed. ${failures.slice(0, 5).join('; ')}` };
		return { status: 'success', message: `Checked ${images.length} photos; repaired ${repaired}.` };
	} catch (e: any) {
		console.error(`[Executor] Failed import for session: ${sessionId}`, e);
		return { status: 'error', message: e.message };
	}
}

async function stackSimilarImages(currentImage: Image, currentHash: string, sessionId: number) {
	const otherImages = await db.query.imageTable.findMany({
		where: and(eq(imageTable.sessionId, sessionId), isNull(imageTable.stackId), eq(imageTable.isStackBase, false))
	});

	let similarImages: Image[] = [];

	for (const otherImage of otherImages) {
		if (otherImage.id === currentImage.id || !otherImage.phash) continue;

		const distance = hammingDistance(currentHash, otherImage.phash);
		if (distance <= SIMILARITY_THRESHOLD) {
			similarImages.push(otherImage);
		}
	}

	if (similarImages.length > 0) {
		console.log(`[Executor] Found ${similarImages.length} similar images for image ${currentImage.id}`);
		const allSimilar = [currentImage, ...similarImages].sort((a, b) => a.recordedAt.getTime() - b.recordedAt.getTime());

		const stackBase = allSimilar[0];

		await db.update(imageTable).set({ isStackBase: true }).where(eq(imageTable.id, stackBase.id));

		for (const img of allSimilar) {
			if (img.id !== stackBase.id) {
				await db.update(imageTable).set({ stackId: stackBase.id }).where(eq(imageTable.id, img.id));
			}
		}
	}
}

export async function runExport(payload: ExportPayload, signal?: AbortSignal): Promise<JobResult> {
	const { sessionId } = payload;

	const session = await db.query.sessionTable.findFirst({
		where: eq(sessionTable.id, sessionId),
		with: {
			images: {
				where: eq(imageTable.isArchived, false),
				columns: { id: true }
			}
		}
	});

	if (!session) {
		console.error(`[Executor] Session not found for export: ${sessionId}`);
		return { status: 'error', message: 'Session not found' };
	}

	const albums = await db.query.albumTable.findMany({
		where: eq(albumTable.sessionId, sessionId)
	});

	console.log(`[Executor] Found ${albums.length} albums for session: ${sessionId}`, albums);

	console.log(`[Executor] Starting export/sync for session: ${sessionId}`);
	try {
		const images = await db.query.imageTable.findMany({
			where: eq(imageTable.sessionId, sessionId),
			orderBy: asc(imageTable.recordedAt)
		});

		for (let i = 0; i < images.length; i++) {
			if (signal?.aborted) {
				throw new Error('Aborted');
			}
			const image = images[i];
			let outputPath = makeOutputPath(image, session);
			if (image.isArchived) {
				await moveExportFile(outputPath, true);
				continue;
			}

			await moveExportFile(outputPath, false);
			const existingPath = await findExportPath(image, session);
			const needsExport = !image.lastExportedAt || image.lastExportedAt < image.updatedAt || !(await fileExists(existingPath));
			let isReadyForUpload = false;

			if (needsExport) {
				console.log(`[Executor] Exporting ${image.filepath}`);
				const edit = await db.query.snapshotTable.findFirst({
					where: eq(snapshotTable.imageId, image.id),
					orderBy: desc(snapshotTable.createdAt)
				});

				const pp3 = parsePP3(edit?.pp3 ?? image.importBaseline ?? '');
				await ensureDir(outputPath);

				// Two-step pipeline: RAW → full-res TIFF → JPEG
				const tifPath = await generateExportTif(image.filepath, { signal });
				const mappedPP3 = await mapCropFromPreviewToExport(pp3, image.tifPath, tifPath);
				await editImage(tifPath, stringifyPP3(mappedPP3), {
					signal,
					outputPath,
					recordedAt: image.recordedAt,
					quality: 90
				});
				await db.update(imageTable).set({ lastExportedAt: new Date() }).where(eq(imageTable.id, image.id));
				isReadyForUpload = true;
			} else {
				outputPath = existingPath;
				isReadyForUpload = true;
			}

			if (isReadyForUpload) {
				for (const album of albums) {
					await upsertAlbumImage(album, image, outputPath);
				}
			}
		}
		console.log(`[Executor] Finished export for session: ${sessionId}`);
		return { status: 'success' };
	} catch (e: any) {
		console.error(`[Executor] Failed export for session: ${sessionId}`, e);
		return { status: 'error', message: e.message };
	}
}

export async function ensureDir(path: string) {
	await mkdir(dirname(path), { recursive: true });
}

async function upsertAlbumImage(album: Album, image: Image, outputPath: string) {
	const integrationType = album.integration;
	const integration = integrations.find((i) => i.type === integrationType);
	assert(integration, `Integration not found: ${integrationType}`);

	if (!integration.isConfigured()) {
		console.warn(`Integration not configured: ${integrationType}`);
		return;
	}

	const media = await db.query.mediaTable.findFirst({
		where: and(eq(mediaTable.albumId, album.id), eq(mediaTable.imageId, image.id), eq(mediaTable.integration, integrationType))
	});

	const buffer = await readFile(outputPath);

	if (media) {
		console.log(`Image ${image.id} already in album ${album.id}, replacing...`);

		try {
			const { id } = await integration.replaceInAlbum(album, media.externalId, buffer, outputPath, image);
			await db.update(mediaTable).set({ externalId: id }).where(eq(mediaTable.id, media.id));
		} catch (error) {
			console.error(`Failed to replace image in album ${album.id} for image ${image.id}:`, error);
		}

		return;
	}

	try {
		console.log(`Uploading image ${image.id} to album ${album.id}...`);
		await db.transaction(async (trx) => {
			const { id } = await integration.uploadFile(buffer, outputPath, image);
			console.log(`Uploaded image ${image.id} to integration, got id ${id}`);
			await trx.insert(mediaTable).values({
				imageId: image.id,
				albumId: album.id,
				externalId: id,
				integration: integrationType
			});
			await integration.addToAlbum(album, [id]);
			console.log(`Added image ${image.id} to album ${album.id}`);
		});
	} catch (error) {
		console.error(`Failed to upload image to album ${album.id} for image ${image.id}:`, error);
	}
}
