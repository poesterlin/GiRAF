import { areSimilar } from '$lib/similar-images';
import { stringifyPP3 } from '$lib/pp3-utils';
import { db } from '$lib/server/db';
import { editImage, generateImportTif, importProfileFor, mapCropFromPreviewToExport } from '$lib/server/image-editor';
import { acquireDevelopBase } from '$lib/server/develop-cache';
import { bmvbhash } from 'blockhash-core';
import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import { readFile, mkdir, rm, stat } from 'fs/promises';
import { decode } from 'jpeg-js';
import { dirname } from 'path';

async function fileExists(path: string) {
	try {
		return (await stat(path)).isFile();
	} catch {
		return false;
	}
}
import { imageTable, mediaTable, sessionTable, albumTable, type Album, type Image } from '../db/schema';
import type { ExportPayload, ImportPayload, JobResult } from './types';
import { integrations } from '../integrations';
import { exiftool } from 'exiftool-vendored';
import { assert } from '$lib';
import { makeOutputPath, moveExportFile, findExportPath } from '../export-files';
import { getExportSettings } from '../export-settings';
import { applyExportSettings, defaultExportSettings, exportSettingsKey } from '$lib/export-settings';
import { calculateImportBaseline } from '../auto-exposure';
import { sameProfile } from '../redevelop';
import { withinDirectory } from '../session-delete';
import { loadEditPP3 } from '../image-records';
import { env } from '$env/dynamic/private';
export { makeSessionPath } from '../export-files';

function errorMessage(e: unknown): string | undefined {
	return e instanceof Error ? e.message : undefined;
}

export async function runImport(payload: ImportPayload, signal?: AbortSignal): Promise<JobResult> {
	const { sessionId, redevelop = false } = payload;

	const images = await db.query.imageTable.findMany({
		where: eq(imageTable.sessionId, sessionId),
		orderBy: asc(imageTable.recordedAt)
	});

	console.log(`[Executor] Starting import for session: ${sessionId}`);
	const failures: string[] = [];
	let repaired = 0;
	let redeveloped = 0;
	// A re-import also brings photos up to the current import profile (e.g. lens correction).
	const currentProfile = await importProfileFor(null);
	try {
		for (const image of images) {
			if (signal?.aborted) {
				throw new Error('Aborted');
			}

			try {
				const usable = async (path: string | null) =>
					path
						? stat(path)
								.then((file) => file.isFile() && file.size > 0)
								.catch((cause) => {
									if (['ENOENT', 'ENOTDIR'].includes((cause as NodeJS.ErrnoException).code ?? '')) return false;
									throw cause;
								})
						: false;
				if (!(await usable(image.filepath))) throw new Error('Original RAW file is missing or empty');
				const needsTiff = !(await usable(image.tifPath)) || image.whiteBalance === null || image.tint === null;
				const needsPreview = !(await usable(image.previewPath));
				const needsRedevelop = redevelop && !needsTiff && !sameProfile(await importProfileFor(image.tifPath), currentProfile);
				if (!needsTiff && !needsRedevelop && !needsPreview && image.phash) continue;
				console.log(`[Executor] ${needsRedevelop ? 'Re-developing' : 'Repairing'} image ${image.id}: ${image.filepath}`);
				if (needsTiff || needsRedevelop) {
					const { pp3, tif } = await generateImportTif(image.filepath, { signal, background: true });
					if (!(await usable(tif))) throw new Error('Generated editor TIFF is missing or empty');
					// Save the repaired TIFF even if preview extraction subsequently fails.
					await db
						.update(imageTable)
						.set({
							tifPath: tif,
							importBaseline: await calculateImportBaseline(tif, signal),
							whiteBalance: pp3.White_Balance?.Temperature as number,
							tint: pp3.White_Balance?.Green as number,
							// Bumping the version refreshes thumbnails browsers cached for the old development.
							...(needsRedevelop ? { version: image.version + 1 } : {})
						})
						.where(eq(imageTable.id, image.id));
					if (needsRedevelop) {
						// The old folder also holds edited thumbnails for the old development.
						if (withinDirectory(env.TMP_DIR, image.tifPath)) await rm(dirname(image.tifPath), { recursive: true, force: true });
						redeveloped++;
						if (!needsPreview && image.phash) continue;
					}
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
		const summary = `Checked ${images.length} photos; repaired ${repaired}` + (redevelop ? `; re-developed ${redeveloped}` : '');
		if (failures.length) return { status: 'error', message: `${summary}; ${failures.length} could not be processed. ${failures.slice(0, 5).join('; ')}` };
		return { status: 'success', message: `${summary}.` };
	} catch (e) {
		console.error(`[Executor] Failed import for session: ${sessionId}`, e);
		return { status: 'error', message: errorMessage(e) };
	}
}

async function stackSimilarImages(currentImage: Image, currentHash: string, sessionId: number) {
	const otherImages = await db.query.imageTable.findMany({
		where: and(eq(imageTable.sessionId, sessionId), isNull(imageTable.stackId), eq(imageTable.isStackBase, false))
	});

	const similarImages: Image[] = [];

	for (const otherImage of otherImages) {
		if (otherImage.id === currentImage.id || !otherImage.phash) continue;

		if (areSimilar({ ...currentImage, phash: currentHash }, otherImage)) {
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
		const settings = await getExportSettings();
		const settingsKey = exportSettingsKey(settings);
		// Sessions exported before export settings existed were exported with the defaults
		const settingsChanged = (session.lastExportSettings ?? exportSettingsKey(defaultExportSettings)) !== settingsKey;
		const images = await db.query.imageTable.findMany({
			where: eq(imageTable.sessionId, sessionId),
			orderBy: asc(imageTable.recordedAt)
		});

		const failures: string[] = [];
		const fail = (image: Image, step: string, cause: unknown) => {
			const message = `${image.name} (ID ${image.id}) ${step}: ${cause instanceof Error ? cause.message : String(cause)}`;
			failures.push(message);
			console.error(`[Executor] ${message}`);
		};
		let exported = 0;

		for (const image of images) {
			if (signal?.aborted) {
				throw new Error('Aborted');
			}
			let outputPath = makeOutputPath(image, session);
			// One photo RawTherapee can't render, or one failed upload, must not hold back the rest of the session
			try {
				if (image.isArchived) {
					await moveExportFile(outputPath, true);
					for (const album of albums) {
						if (album.integration !== 'immich') continue;
						try {
							await removeArchivedAlbumImage(album, image);
						} catch (cause) {
							fail(image, `removing from ${album.integration} album`, cause);
						}
					}
					continue;
				}

				await moveExportFile(outputPath, false);
				const existingPath = await findExportPath(image, session);
				const needsExport = settingsChanged || !image.lastExportedAt || image.lastExportedAt < image.updatedAt || !(await fileExists(existingPath));

				if (needsExport) {
					console.log(`[Executor] Exporting ${image.filepath}`);
					// Stamp the export with when it started, so an edit saved while rendering is exported again
					const exportStartedAt = new Date();
					const pp3 = await loadEditPP3(image);
					await ensureDir(outputPath);

					// Two-step pipeline: RAW → cached full-res develop base (intermediate representation) → JPEG
					const base = await acquireDevelopBase(image.filepath, { signal, previewTif: image.tifPath, background: true });
					try {
						const mappedPP3 = applyExportSettings(await mapCropFromPreviewToExport(pp3, image.tifPath, base.path), settings);
						await editImage(base.path, stringifyPP3(mappedPP3), {
							signal,
							outputPath,
							recordedAt: image.recordedAt,
							quality: settings.quality,
							background: true
						});
					} finally {
						base.release();
					}
					await db.update(imageTable).set({ lastExportedAt: exportStartedAt }).where(eq(imageTable.id, image.id));
					exported++;
				} else {
					outputPath = existingPath;
				}
			} catch (cause) {
				if (signal?.aborted) throw cause;
				fail(image, 'export', cause);
				continue;
			}

			for (const album of albums) {
				try {
					await upsertAlbumImage(album, image, outputPath);
				} catch (cause) {
					if (signal?.aborted) throw cause;
					fail(image, `upload to ${album.integration}`, cause);
				}
			}
		}
		if (!failures.length) await db.update(sessionTable).set({ lastExportSettings: settingsKey }).where(eq(sessionTable.id, sessionId));
		console.log(`[Executor] Finished export for session: ${sessionId}`);
		const summary = `Exported ${exported} of ${images.filter((image) => !image.isArchived).length} photos`;
		if (failures.length) return { status: 'error', message: `${summary}; ${failures.length} problem${failures.length === 1 ? '' : 's'}. ${failures.slice(0, 5).join('; ')}` };
		return { status: 'success', message: `${summary}.` };
	} catch (e) {
		console.error(`[Executor] Failed export for session: ${sessionId}`, e);
		return { status: 'error', message: errorMessage(e) };
	}
}

async function removeArchivedAlbumImage(album: Album, image: Image) {
	const integration = integrations.find((integration) => integration.type === album.integration);
	assert(integration, `Integration not found: ${album.integration}`);
	if (!integration.isConfigured()) return;

	const media = await db.query.mediaTable.findMany({
		where: and(eq(mediaTable.albumId, album.id), eq(mediaTable.imageId, image.id), eq(mediaTable.integration, album.integration))
	});
	if (!media.length) return;

	// Clear membership records only after Immich confirms removal, so failures retry on sync.
	await integration.removeFromAlbum(
		album,
		media.map((item) => item.externalId)
	);
	await db.delete(mediaTable).where(
		inArray(
			mediaTable.id,
			media.map((item) => item.id)
		)
	);
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

		const { id } = await integration.replaceInAlbum(album, media.externalId, buffer, outputPath, image);
		await db.update(mediaTable).set({ externalId: id }).where(eq(mediaTable.id, media.id));
		return;
	}

	console.log(`Uploading image ${image.id} to album ${album.id}...`);
	const { id } = await integration.uploadFile(buffer, outputPath, image);
	console.log(`Uploaded image ${image.id} to integration, got id ${id}`);
	// Record the upload before adding it to the album. If adding fails, the next sync then replaces this
	// upload (which also adds it to the album) instead of uploading the photo a second time.
	await db.insert(mediaTable).values({
		imageId: image.id,
		albumId: album.id,
		externalId: id,
		integration: integrationType
	});
	await integration.addToAlbum(album, [id]);
	console.log(`Added image ${image.id} to album ${album.id}`);
}
