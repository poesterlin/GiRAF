
import { albumTable, mediaTable, type Album } from '$lib/server/db/schema';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../db';

export async function storeAlbum(albumData: typeof albumTable.$inferInsert, dbTx = db) {
	const [newAlbum] = await dbTx
		.insert(albumTable)
		.values(albumData)
		.returning();

	return newAlbum;
}

export async function storeMedia(mediaData: typeof mediaTable.$inferInsert, dbTx = db) {
	const [newMedia] = await dbTx
		.insert(mediaTable)
		.values(mediaData)
		.returning();

	return newMedia;
}

export async function getAlbumByExternalId(integration: string, externalId: string, dbTx = db) {
	const album = await dbTx.query.albumTable.findFirst({
		where: and(
			eq(albumTable.integration, integration),
			eq(albumTable.externalId, externalId)
		)
	});

	return album;
}

export async function getMediaByExternalIds(integration: string, externalId: string[], dbTx = db) {
	const media = await dbTx.query.mediaTable.findMany({
		where: and(
			eq(mediaTable.integration, integration),
			inArray(mediaTable.externalId, externalId)
		)
	});

	return media;
}

export async function removeFromAlbum(albumId: number, mediaIds: number[], dbTx = db): Promise<void> {
	await dbTx
		.delete(mediaTable)
		.where(and(
			eq(mediaTable.albumId, albumId),
			inArray(mediaTable.imageId, mediaIds)
		));
}
