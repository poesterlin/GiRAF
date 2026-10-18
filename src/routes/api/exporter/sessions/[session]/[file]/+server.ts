import { db } from '$lib/server/db';
import { sessionTable } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';
import { basename, join } from 'path';
import { makeSessionPath } from '$lib/server/jobs/executor';
import { respondWithFile } from '$lib/server/utils';
import { withinDirectory } from '$lib/server/session-delete';
import { snapExportPreviewSize } from '$lib/export-preview';
import { stat } from 'node:fs/promises';
import sharp from 'sharp';

export const GET: RequestHandler = async ({ params, url, request }) => {
	const { session: sessionId, file } = params;

	const session = await db.query.sessionTable.findFirst({
		where: eq(sessionTable.id, Number(sessionId))
	});

	if (!session) {
		error(404, { message: `Session with ID ${sessionId} not found.` });
	}

	const path = makeSessionPath(session);
	// The name arrives URL-decoded, so `..%2F` would otherwise climb out of the export folder
	const name = basename(file);
	const filepath = join(path, name);
	if (name !== file || name === '..' || !withinDirectory(path, filepath)) {
		error(400, { message: 'Invalid file name.' });
	}

	const size = url.searchParams.get('size');
	if (size) return previewResponse(filepath, snapExportPreviewSize(Number(size)), request.headers.get('if-none-match'));

	// Re-exports overwrite the same file name, so never let a cache keep an old render
	return respondWithFile(filepath, 0);
};

/**
 * A screen-sized WebP of an export, so the exporter doesn't send a full-resolution JPEG to a phone.
 * Re-exports keep the file name, so the ETag follows the file's modification time and browsers revalidate.
 */
async function previewResponse(filepath: string, size: number, ifNoneMatch: string | null): Promise<Response> {
	let modified: number;
	try {
		modified = (await stat(filepath)).mtimeMs;
	} catch {
		error(404, { message: 'File not found.' });
	}
	const etag = `"${Math.round(modified)}-${size}"`;
	const headers = { ETag: etag, 'Cache-Control': 'private, no-cache' };
	if (ifNoneMatch === etag) return new Response(null, { status: 304, headers });

	const webp = await sharp(filepath).rotate().resize({ width: size, height: size, fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
	return new Response(new Uint8Array(webp), { headers: { ...headers, 'Content-Type': 'image/webp', 'Content-Length': String(webp.length) } });
}
