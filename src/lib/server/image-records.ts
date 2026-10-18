import { parsePP3 } from '$lib/pp3-utils';
import { db } from '$lib/server/db';
import { imageTable, snapshotTable, type Image } from '$lib/server/db/schema';
import { desc, eq } from 'drizzle-orm';

export function findImage(id: number) {
	return db.query.imageTable.findFirst({ where: eq(imageTable.id, id) });
}

/** The PP3 an image is rendered with: its latest saved edit, falling back to the import baseline. */
export async function loadEditPP3(image: Image) {
	const edit = await db.query.snapshotTable.findFirst({
		where: eq(snapshotTable.imageId, image.id),
		orderBy: desc(snapshotTable.createdAt)
	});

	return parsePP3(edit?.pp3 ?? image.importBaseline ?? '');
}
