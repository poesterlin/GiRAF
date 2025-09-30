import { db } from '$lib/server/db';
import { imageTable, sessionTable } from '$lib/server/db/schema';
import { and, eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { createWriteStream } from 'fs';
import archiver from 'archiver';
import { tmpdir } from 'os';
import { join, basename } from 'path';
import { respondWithFile } from '$lib/server/utils';

export const GET: RequestHandler = async ({ params }) => {
	const sessionId = Number(params.id);
	if (Number.isNaN(sessionId)) {
		return new Response('Invalid session id', { status: 400 });
	}

	const session = await db.query.sessionTable.findFirst({ where: eq(sessionTable.id, sessionId) });
	if (!session) {
		return new Response('Session not found', { status: 404 });
	}

	const images = await db.query.imageTable.findMany({
		where: and(eq(imageTable.sessionId, sessionId), eq(imageTable.isArchived, false))
	});

	if (!images || images.length === 0) {
		return new Response('No images to download', { status: 404 });
	}

	const zipPath = join(tmpdir(), `session-${sessionId}-raw.zip`);

	const output = createWriteStream(zipPath);
	const archive = archiver('zip', { zlib: { level: 9 } });

	archive.pipe(output);

	for (const img of images) {
		// Use the original filename for the zip entry
		const name = basename(img.filepath);
		archive.file(img.filepath, { name });
	}

	try {
		await new Promise<void>((resolve, reject) => {
			output.on('close', () => resolve());
			output.on('end', () => resolve());
			archive.on('error', (err) => reject(err));
			archive.finalize().catch(reject);
		});
	} catch (err: any) {
		console.error('Failed to create zip', err);
		return new Response('Failed to create zip', { status: 500 });
	}

	return respondWithFile(zipPath, 0);
};
