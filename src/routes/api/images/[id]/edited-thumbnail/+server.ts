import { db } from '$lib/server/db';
import { imageTable, snapshotTable } from '$lib/server/db/schema';
import { editedThumbnailPath, queueEditedThumbnail } from '$lib/server/edited-thumbnail';
import { and, eq } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, url, fetch }) => {
	const id = Number(params.id);
	const snapshotId = Number(url.searchParams.get('snapshot'));
	const image = await db.query.imageTable.findFirst({ where: eq(imageTable.id, id) });
	if (!image) error(404, 'Image not found');
	if (image.tifPath && Number.isSafeInteger(snapshotId) && snapshotId > 0) {
		const snapshot = await db.query.snapshotTable.findFirst({ where: and(eq(snapshotTable.id, snapshotId), eq(snapshotTable.imageId, id)) });
		if (snapshot) {
			const file = Bun.file(editedThumbnailPath(image, snapshotId));
			if (await file.exists())
				return new Response(await file.arrayBuffer(), { headers: { 'Content-Type': 'image/webp', 'Cache-Control': 'private, max-age=31536000, immutable' } });
			queueEditedThumbnail(image, snapshot);
		}
	}
	const response = await fetch(`/api/images/${id}/preview?version=${image.version}`);
	const headers = new Headers(response.headers);
	for (const name of ['Cache-Control', 'Expires', 'ETag', 'Last-Modified', 'Age']) headers.delete(name);
	return new Response(response.body, { status: response.status, headers });
};
