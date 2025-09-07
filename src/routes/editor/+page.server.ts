import { db } from '$lib/server/db';
import { imageTable, imageToTagTable, tagTable, type Tag } from '$lib/server/db/schema';
import { desc, eq, sql } from 'drizzle-orm';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const tags = await db.select({
		name: tagTable.name,
		id: tagTable.id,
		images: sql<number>`jSON_AGG(DISTINCT ${imageTable.id})`.as<number[]>(),
	})
		.from(tagTable)
		.innerJoin(imageToTagTable, eq(tagTable.id, imageToTagTable.tagId))
		.innerJoin(imageTable, eq(imageToTagTable.imageId, imageTable.id))
		.groupBy(tagTable.id)
		.orderBy(desc(tagTable.name));

	return { tags };
};


