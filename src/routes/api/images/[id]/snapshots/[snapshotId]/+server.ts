import { db } from '$lib/server/db';
import { imageTable, snapshotTable } from '$lib/server/db/schema';
import { json, type RequestHandler } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';

export const DELETE: RequestHandler = async ({ params }) => {
	const imageId = Number(params.id);
	const snapshotId = Number(params.snapshotId);
	if (!Number.isInteger(imageId) || !Number.isInteger(snapshotId)) return json({ error: 'Invalid id' }, { status: 400 });

	const deleted = await db.delete(snapshotTable).where(and(eq(snapshotTable.id, snapshotId), eq(snapshotTable.imageId, imageId))).returning({ id: snapshotTable.id });
	if (!deleted.length) return json({ error: 'Snapshot not found' }, { status: 404 });

	// The image now renders from an older version, so an earlier export is out of date
	await db.update(imageTable).set({ updatedAt: new Date() }).where(eq(imageTable.id, imageId));

	return json({ success: true });
};
