import { error, json, type RequestHandler } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { db } from '$lib/server/db';
import { importTable } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { ExifDate, ExifDateTime, exiftool } from 'exiftool-vendored';
import { basename, extname, join } from 'path';
import { access, writeFile, unlink } from 'fs/promises';
import { createHash, randomUUID } from 'crypto';
import { constants } from 'fs';
import { backfillImportFingerprints, findImportDuplicate } from '$lib/server/import-fingerprints';

const IMPORT_DIR = env.IMPORT_DIR;

function toDate(value: string | number | ExifDateTime | ExifDate | Date) {
	if (value instanceof Date) {
		return value;
	}
	if (typeof value === 'string' || typeof value === 'number') {
		return new Date(value);
	}
	if (value instanceof ExifDateTime || value instanceof ExifDate) {
		return value.toDate();
	}
	throw new Error('Unsupported date format');
}

export const POST: RequestHandler = async ({ request }) => {
	console.log('[UPLOAD] Received upload request');
	if (!IMPORT_DIR) {
		console.error('[UPLOAD] IMPORT_DIR not configured');
		error(500, 'IMPORT_DIR not configured');
	}

	try {
		await access(IMPORT_DIR, constants.W_OK);
	} catch {
		error(500, `IMPORT_DIR is not writable: ${IMPORT_DIR}`);
	}

	const formData = await request.formData();
	const files = formData.getAll('files') as File[];

	console.log(`[UPLOAD] Processing ${files.length} files`);

	if (files.length === 0) {
		error(400, 'No files uploaded');
	}

	const results = [];

	for (const file of files) {
		if (!(file instanceof File)) {
			results.push({ status: 'error', message: 'Invalid uploaded file' });
			continue;
		}
		const safeName = basename(file.name.replaceAll('\\', '/'));
		if (!safeName || safeName === '.' || safeName === '..') {
			results.push({ name: file.name, status: 'error', message: 'Invalid filename' });
			continue;
		}
		let filePath = join(IMPORT_DIR, safeName);
		let written = false;
		console.log(`[UPLOAD] Saving to ${filePath}`);

		try {
			// Check if file already exists in DB
			const existing = await db.query.importTable.findFirst({
				where: eq(importTable.filePath, filePath)
			});

			const buffer = Buffer.from(await file.arrayBuffer());
			const contentHash = createHash('sha256').update(buffer).digest('hex');
			await backfillImportFingerprints([buffer.length]);
			const duplicate = await findImportDuplicate(contentHash, buffer.length);
			if (duplicate) {
				console.log(`[UPLOAD] ${file.name} already in queue, skipping`);
				results.push({
					name: file.name,
					status: 'skipped',
					message: duplicate.importedAt ? 'Already imported' : 'Already in queue',
					...(duplicate.importedAt ? {} : { id: duplicate.id })
				});
				continue;
			}

			// Save file
			const extension = extname(safeName);
			const uniquePath = () => join(IMPORT_DIR, `${safeName.slice(0, safeName.length - extension.length)}-${randomUUID()}${extension}`);
			if (existing) filePath = uniquePath();
			for (;;) {
				try {
					await writeFile(filePath, buffer, { flag: 'wx' });
					written = true;
					break;
				} catch (e) {
					if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
					filePath = uniquePath();
				}
			}
			console.log(`[UPLOAD] ${file.name} saved successfully`);

			// Extract metadata
			const tags = await exiftool.read(filePath);
			const recordingDate = tags?.CreateDate || tags?.DateTimeOriginal || new Date();

			// Add to importTable
			const [inserted] = await db
				.insert(importTable)
				.values({
					filePath,
					contentHash,
					fileSize: buffer.length,
					date: toDate(recordingDate)
				})
				.returning();

			console.log(`[UPLOAD] ${file.name} added to DB with ID ${inserted.id}`);
			results.push({ name: file.name, status: 'success', id: inserted.id });
		} catch (e) {
			if (written) await unlink(filePath).catch(() => {});
			console.error(`[UPLOAD] Failed to upload ${file.name}:`, e);
			results.push({ name: file.name, status: 'error', message: String(e) });
		}
	}

	return json({ results });
};
