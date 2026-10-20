import { json, type RequestHandler } from '@sveltejs/kit';
import { and, desc, eq, lte } from 'drizzle-orm';
import { stat } from 'node:fs/promises';
import { db } from '$lib/server/db';
import { imageTable, sessionTable, snapshotTable } from '$lib/server/db/schema';
import { queueEditedThumbnail } from '$lib/server/edited-thumbnail';
import { findExportPath } from '$lib/server/export-files';

/**
 * Restores a saved version as a new snapshot. History stays intact, and when the
 * restored version is the one that was exported, the photo stops being pending:
 * the export file on disk already shows exactly this look.
 */
export const POST: RequestHandler = async ({ params, request }) => {
	const imageId = Number(params.id);
	if (!Number.isInteger(imageId)) {
		return json({ error: 'Invalid image id' }, { status: 400 });
	}

	let snapshotId: number;
	try {
		const body = (await request.json()) as { snapshotId?: unknown };
		snapshotId = Number(body.snapshotId);
	} catch {
		return json({ error: 'Invalid request body' }, { status: 400 });
	}

	if (!Number.isSafeInteger(snapshotId) || snapshotId <= 0) {
		return json({ error: 'snapshotId is required' }, { status: 400 });
	}

	const image = await db.query.imageTable.findFirst({ where: eq(imageTable.id, imageId) });
	if (!image) {
		return json({ error: 'Image not found' }, { status: 404 });
	}

	const target = await db.query.snapshotTable.findFirst({
		where: and(eq(snapshotTable.id, snapshotId), eq(snapshotTable.imageId, imageId))
	});
	if (!target) {
		return json({ error: 'Snapshot not found' }, { status: 404 });
	}

	let revertedToExport = false;
	if (image.lastExportedAt) {
		const exported = await db.query.snapshotTable.findFirst({
			where: and(eq(snapshotTable.imageId, imageId), lte(snapshotTable.createdAt, image.lastExportedAt)),
			orderBy: [desc(snapshotTable.createdAt), desc(snapshotTable.id)]
		});

		if (exported?.id === target.id) {
			const session = await db.query.sessionTable.findFirst({ where: eq(sessionTable.id, image.sessionId) });
			if (session) {
				const exportPath = await findExportPath(image, session);
				revertedToExport = await stat(exportPath)
					.then((file) => file.isFile())
					.catch(() => false);
			}
		}
	}

	const now = new Date();
	const [snapshot] = await db.insert(snapshotTable).values({ imageId, pp3: target.pp3, createdAt: now }).returning();

	await db
		.update(imageTable)
		.set(revertedToExport ? { updatedAt: now, lastExportedAt: now } : { updatedAt: now })
		.where(eq(imageTable.id, imageId));
	queueEditedThumbnail(image, snapshot);

	return json({ snapshot, revertedToExport }, { status: 201 });
};
