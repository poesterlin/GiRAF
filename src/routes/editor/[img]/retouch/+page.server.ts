import { db } from '$lib/server/db';
import { imageTable, snapshotTable } from '$lib/server/db/schema';
import { error } from '@sveltejs/kit';
import { desc, eq } from 'drizzle-orm';
import sharp from 'sharp';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const id = Number(params.img);
	const image = await db.query.imageTable.findFirst({ where: eq(imageTable.id, id) });
	if (!image?.tifPath) error(404, 'Imported photo not found');
	const [snapshots, metadata] = await Promise.all([
		db.query.snapshotTable.findMany({ where: eq(snapshotTable.imageId, id), orderBy: desc(snapshotTable.createdAt) }),
		sharp(image.tifPath).metadata()
	]);
	const exportScale = Math.max(1, image.resolutionX / metadata.width!, image.resolutionY / metadata.height!);
	return { image, snapshots, dimensions: { width: metadata.width!, height: metadata.height! }, maxRadius: Math.max(1, Math.floor(400 / exportScale)) };
};
