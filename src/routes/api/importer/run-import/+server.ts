
import * as path from 'path';
import * as fs from 'fs';
import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { importTable } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { ExifDate, ExifDateTime, exiftool } from 'exiftool-vendored';
import { env } from '$env/dynamic/private';

const IMPORT_DIR = env.IMPORT_DIR;

if (!IMPORT_DIR) {
	console.error('IMPORT_DIR environment variable is not set. Please create a .env file and set it.');
	// In a server route, we should throw an error or return an appropriate response
	// rather than exiting the process.
}

const absoluteImportDir = IMPORT_DIR ? path.resolve(IMPORT_DIR) : '';

const supportedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.tif', '.tiff', '.arw', '.nef', '.cr2', '.raf'];

function toDate(value: string | number | ExifDateTime | ExifDate){
	if (typeof value === 'string' || typeof value === 'number') {
		return new Date(value);
	}

	if (value instanceof ExifDateTime || value instanceof ExifDate) {
		return value.toDate();
	}
	return new Date(); // Fallback
}

async function importFile(filePath: string) {
	const extension = path.extname(filePath).toLowerCase();
	if (!supportedExtensions.includes(extension)) {
		console.log(`[IGNORE] Skipping unsupported file type: ${path.basename(filePath)}`);
		return;
	}

	const fileName = path.basename(filePath);

	try {
		console.log(`[CHECK] Found file: ${fileName}`);
		const existing = await db.query.importTable.findFirst({
			where: eq(importTable.filePath, filePath)
		});

		if (existing) {
			console.log(`[SKIP] "${fileName}" is already in the import queue.`);
			return;
		}

		const tags = await exiftool.read(filePath);
		const recordingDate = tags?.CreateDate || tags?.DateTimeOriginal;

		if (!recordingDate) {
			console.log(`[IGNORE] "${fileName}" is missing a recording date.`);
			return;
		}

		console.log(`[QUEUE] Adding "${fileName}" to the import queue...`);
		await db.insert(importTable).values({
			filePath,
			date: toDate(recordingDate),
		});
		console.log(`[SUCCESS] "${fileName}" added to queue.`);
	} catch (error) {
		console.error(`[ERROR] Failed to add "${fileName}" to queue:`, error);
	}
}

export async function POST() {
	if (!absoluteImportDir || !fs.existsSync(absoluteImportDir)) {
		return json({ message: 'Import directory not found or not configured.', success: false }, { status: 400 });
	}

	const files = fs.readdirSync(absoluteImportDir);
	const importPromises = files.map(file => importFile(path.join(absoluteImportDir, file)));

			await Promise.all(importPromises);

	return json({ message: 'Import process initiated.', success: true });
}
