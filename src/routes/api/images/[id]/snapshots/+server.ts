import { db } from '$lib/server/db';
import { imageTable, snapshotTable } from '$lib/server/db/schema';
import { json, type RequestHandler } from '@sveltejs/kit';
import { and, eq, gt, notExists } from 'drizzle-orm';
import { queueEditedThumbnail } from '$lib/server/edited-thumbnail';

export const GET: RequestHandler = async ({ params }) => {
	const imageId = Number(params.id);
	const snapshots = await db.query.snapshotTable.findMany({
		where: eq(snapshotTable.imageId, imageId)
	});
	return json(snapshots);
};

export const POST: RequestHandler = async ({ request, params }) => {
	const imageId = Number(params.id);
	const { pp3 } = await request.json();

	const image = await db.query.imageTable.findFirst({
		where: eq(imageTable.id, imageId)
	});

	if (!image) {
		return json({ error: 'Image not found' }, { status: 404 });
	}

	const [newSnapshot] = await db
		.insert(snapshotTable)
		.values({
			imageId,
			pp3
		})
		.returning();

	await db
		.update(imageTable)
		.set({ updatedAt: new Date() })
		.where(and(eq(imageTable.id, imageId)));
	queueEditedThumbnail(image, newSnapshot);

	return json(newSnapshot, { status: 201 });
};

/**
 * Rewrites the latest snapshot in place. Only the newest version of an image
 * may change, so anything older is refused and the client falls back to a new
 * snapshot. Thumbnails are intentionally left alone: they belong to the version
 * that was created, not to later tweaks inside it.
 */
export const PATCH: RequestHandler = async ({ request, params }) => {
	const imageId = Number(params.id);
	const { pp3, snapshotId } = (await request.json()) as { pp3?: string; snapshotId?: number };

	if (typeof pp3 !== 'string' || !Number.isSafeInteger(snapshotId) || Number(snapshotId) <= 0) {
		return json({ error: 'pp3 and snapshotId are required' }, { status: 400 });
	}

	const image = await db.query.imageTable.findFirst({
		where: eq(imageTable.id, imageId)
	});

	if (!image) {
		return json({ error: 'Image not found' }, { status: 404 });
	}

	const [updated] = await db
		.update(snapshotTable)
		.set({ pp3 })
		.where(
			and(
				eq(snapshotTable.id, Number(snapshotId)),
				eq(snapshotTable.imageId, imageId),
				notExists(
					db
						.select({ id: snapshotTable.id })
						.from(snapshotTable)
						.where(and(eq(snapshotTable.imageId, imageId), gt(snapshotTable.id, Number(snapshotId))))
				)
			)
		)
		.returning();

	if (!updated) {
		return json({ error: 'Only the latest snapshot can be updated' }, { status: 409 });
	}

	await db.update(imageTable).set({ updatedAt: new Date() }).where(eq(imageTable.id, imageId));

	return json(updated);
};
