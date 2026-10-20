import { db } from '$lib/server/db';
import { imageTable, sessionTable, type Image } from '$lib/server/db/schema';
import { makeOutputPath, moveExportFile } from '$lib/server/export-files';
import { findImage } from '$lib/server/image-records';
import { and, eq, gt } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';

/** Moves the image's export file in or out of the archive folder and flags the row. Returns null if the image does not exist. */
async function setArchived(id: number, archived: boolean): Promise<Image | null> {
	const image = await findImage(id);
	if (!image) return null;

	const session = await db.query.sessionTable.findFirst({ where: eq(sessionTable.id, image.sessionId) });
	if (session) {
		await moveExportFile(makeOutputPath(image, session), archived);
	}
	await db
		.update(imageTable)
		.set({ isArchived: archived, archivedAt: archived ? new Date() : null })
		.where(eq(imageTable.id, id));

	return image;
}

export const POST: RequestHandler = async ({ params }) => {
	const id = Number(params.id);

	const image = await setArchived(id, true);
	if (!image) {
		return json({ error: 'Image not found' }, { status: 404 });
	}

	// find next image in line
	const [nextImage] = await db
		.select({ id: imageTable.id })
		.from(imageTable)
		.where(and(eq(imageTable.isArchived, false), gt(imageTable.recordedAt, image.recordedAt), eq(imageTable.sessionId, image.sessionId)))
		.orderBy(imageTable.id)
		.limit(1);

	return json({ next: nextImage?.id });
};

export const DELETE: RequestHandler = async ({ params }) => {
	const image = await setArchived(Number(params.id), false);
	if (!image) {
		return json({ error: 'Image not found' }, { status: 404 });
	}

	return new Response();
};
