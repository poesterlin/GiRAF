import { db } from '$lib/server/db';
import { imageTable, snapshotTable } from '$lib/server/db/schema';
import { json, type RequestHandler } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';

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
			pp3,
		})
		.returning();

	await db.update(imageTable).set({ updatedAt: new Date() }).where(and(eq(imageTable.id, imageId)));

	return json(newSnapshot, { status: 201 });
};
