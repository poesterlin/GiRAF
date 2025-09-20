import ExportPP3 from '$lib/assets/export.pp3?raw';
import { applyPP3Diff, parsePP3, stringifyPP3, type PP3 } from '$lib/pp3-utils';
import { db } from '$lib/server/db';
import { editImage, generateImportTif, setWhiteBalance } from '$lib/server/image-editor';
import { bmvbhash } from 'blockhash-core';
import { and, asc, desc, eq, isNull } from 'drizzle-orm';
import { readFile } from 'fs/promises';
import { decode } from 'jpeg-js';
import { join } from 'path';
import { imageTable, mediaTable, sessionTable, snapshotTable, type Album, type Image, type Session } from '../db/schema';
import type { ExportPayload, ImportPayload, JobResult } from './types';
import { integrations } from '../integrations';
import { exiftool } from 'exiftool-vendored';
import { assert } from '$lib';

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
	try {
		for (const image of images) {
			if (signal?.aborted) {
				throw new Error('Aborted');
			}
			console.log(`[Executor] Processing ${image.filepath}`);
			const { pp3, tif } = await generateImportTif(image.filepath, { signal });

			// Calculate perceptual hash
			const tempFile = '/tmp/' + image.id + '_preview.jpg';
			await exiftool.extractPreview(image.filepath, tempFile, { ignoreMinorErrors: true, forceWrite: true });
			const jpegData = await readFile(tempFile);
			const { width, height, data } = decode(jpegData, { useTArray: true });
			const hash = await bmvbhash({ data, width, height }, 16);

			await db
				.update(imageTable)
				.set({
					tifPath: tif,
					whiteBalance: pp3.White_Balance?.Temperature as number,
					tint: pp3.White_Balance?.Green as number,
					phash: hash,
					previewPath: tempFile
				})
				.where(eq(imageTable.id, image.id));

			// Find similar images and stack them
			await stackSimilarImages(image, hash, sessionId);
		}
		console.log(`[Executor] Finished import for session: ${sessionId}.`);
		return { status: 'success' };
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

	const session = await db.query.sessionTable.findFirst({ where: eq(sessionTable.id, sessionId) });
	if (!session) {
		console.error(`[Executor] Session not found for export: ${sessionId}`);
		return { status: 'error', message: 'Session not found' };
	}

	const albums = await db.query.albumTable.findMany({
		where: eq(sessionTable.id, sessionId)
	});

	console.log(`[Executor] Found ${albums.length} albums for session: ${sessionId}`, albums);

	console.log(`[Executor] Starting export for session: ${sessionId}`);
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
			if (image.isArchived) {
				console.log(`[Executor] Skipping archived image: ${image.id}`);
				continue;
			}

			const edit = await db.query.snapshotTable.findFirst({
				where: eq(snapshotTable.imageId, image.id),
				orderBy: desc(snapshotTable.createdAt)
			});

			const pp3 = setWhiteBalance(parsePP3(edit?.pp3 ?? ''), image.whiteBalance, image.tint);
			const merged = applyPP3Diff(pp3, parsePP3(ExportPP3));


			console.log(`[Executor] Processing ${image.filepath}`);
			const outputPath = makeOutputPath(image, session, images.length);
			await mkdirPath(outputPath);
			await editImage(image.filepath, stringifyPP3(merged), { signal, outputPath, recordedAt: image.recordedAt });

			for (const album of albums) {
				await upsertAlbumImage(album, image, outputPath);
			}
		}
		console.log(`[Executor] Finished export for session: ${sessionId}`);
		return { status: 'success' };
	} catch (e: any) {
		console.error(`[Executor] Failed export for session: ${sessionId}`, e);
		return { status: 'error', message: e.message };
	}
}

export function makeOutputPath(image: Image, session: Session, totalImages: number): string {
	const digits = Math.max(2, Math.ceil(Math.log10(totalImages + 1)));

	const year = image.recordedAt.getFullYear();
	const month = (image.recordedAt.getMonth() + 1).toString().padStart(2, '0');
	const day = image.recordedAt.getDate().toString().padStart(2, '0');

	const exportDir = process.env.EXPORT_DIR || '/exports';
	return join(exportDir, year.toString(), `${year}-${month}-${day}_${session.name}`, `${image.id.toString().padStart(digits, '0')}_${session.name}.jpg`);
}

export async function mkdirPath(path: string) {
	await Bun.file(path).write('');
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

