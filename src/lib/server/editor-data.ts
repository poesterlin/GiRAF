import { error } from '@sveltejs/kit';
import { desc, eq } from 'drizzle-orm';
import { db } from './db';
import { imageTable, snapshotTable } from './db/schema';

export async function loadEditorImage(imageId: number) {
	const [image, snapshots] = await Promise.all([
		db.query.imageTable.findFirst({ where: eq(imageTable.id, imageId) }),
		db.query.snapshotTable.findMany({ where: eq(snapshotTable.imageId, imageId), orderBy: desc(snapshotTable.createdAt) })
	]);
	if (!image) error(404, { message: 'Image or session not found' });
	return { image, snapshots };
}
