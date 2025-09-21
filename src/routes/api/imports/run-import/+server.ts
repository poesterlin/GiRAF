
import * as path from 'path';
import * as fs from 'fs';
import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { importTable } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { ExifDate, ExifDateTime, exiftool } from 'exiftool-vendored';
import { env } from '$env/dynamic/private';
import { Glob } from 'bun';
import pLimit from 'p-limit';
import { cpus } from 'os';

const limit = pLimit(cpus().length);
const IMPORT_DIR = env.IMPORT_DIR;

if (!IMPORT_DIR) {
	console.error('IMPORT_DIR environment variable is not set. Please create a .env file and set it.');
}

const supportedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.tif', '.tiff', '.arw', '.nef', '.cr2', '.raf'];

function toDate(value: string | number | ExifDateTime | ExifDate) {
	if (typeof value === 'string' || typeof value === 'number') {
		return new Date(value);
	}

	if (value instanceof ExifDateTime || value instanceof ExifDate) {
		return value.toDate();
	}

	throw new Error('Unsupported date format');
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
	if (!IMPORT_DIR || !fs.existsSync(IMPORT_DIR)) {
		return json({ message: 'Import directory not found or not configured.', success: false }, { status: 400 });
	}

	const glob = new Glob('**/*');
	const matches = glob.scan({ cwd: IMPORT_DIR });

	const files = await Array.fromAsync(matches);
	const importPromises = files.map(file => limit(() => importFile(path.join(IMPORT_DIR, file))));

	const existingImports = await db.query.importTable.findMany();
	for (const imp of existingImports) {
		const exists = await Bun.file(imp.filePath).exists();
		if (!exists) {
			console.log(`[REMOVE] File no longer exists, removing from import queue: ${imp.filePath}`);
			await db.delete(importTable).where(eq(importTable.id, imp.id));
		}
	}

	await Promise.all(importPromises);

	return json({ message: 'Import process initiated.', success: true });
}
