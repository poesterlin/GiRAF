import { db } from '$lib/server/db';
import { imageTable, imageToTagTable, sessionTable, snapshotTable, tagTable } from '$lib/server/db/schema';
import { and, asc, count, desc, eq, max, sql } from 'drizzle-orm';

/** A photo as the gallery's contact sheets show it: its newest edit where it has one. */
export type LibraryPhoto = {
	id: number;
	version: number;
	snapshotId: number | null;
	sessionId: number;
	sessionName: string;
	editedAt: string | null;
};

const latestSnapshotId = sql<number | null>`(select ${snapshotTable.id} from ${snapshotTable} where ${snapshotTable.imageId} = ${imageTable.id} order by ${snapshotTable.createdAt} desc, ${snapshotTable.id} desc limit 1)`;
const visible = and(eq(imageTable.isArchived, false), eq(sessionTable.isArchived, false));

/** The library's most recently edited photos, newest edit first. */
export async function recentlyEdited(limit: number): Promise<LibraryPhoto[]> {
	const editedAt = max(snapshotTable.createdAt);
	const rows = await db
		.select({ id: imageTable.id, version: imageTable.version, sessionId: sessionTable.id, sessionName: sessionTable.name, editedAt, snapshotId: latestSnapshotId })
		.from(imageTable)
		.innerJoin(snapshotTable, eq(snapshotTable.imageId, imageTable.id))
		.innerJoin(sessionTable, eq(sessionTable.id, imageTable.sessionId))
		.where(visible)
		.groupBy(imageTable.id, sessionTable.id)
		.orderBy(desc(editedAt), desc(imageTable.id))
		.limit(limit);
	return rows.map((row) => ({ ...row, editedAt: row.editedAt ? new Date(row.editedAt).toISOString() : null }));
}

/** Every tag in use, with how many visible photos carry it. */
export async function libraryTags(): Promise<{ name: string; count: number }[]> {
	return db
		.select({ name: tagTable.name, count: count(imageTable.id) })
		.from(tagTable)
		.innerJoin(imageToTagTable, eq(imageToTagTable.tagId, tagTable.id))
		.innerJoin(imageTable, eq(imageTable.id, imageToTagTable.imageId))
		.innerJoin(sessionTable, eq(sessionTable.id, imageTable.sessionId))
		.where(visible)
		.groupBy(tagTable.id)
		.orderBy(asc(tagTable.name));
}

/** The photos carrying a tag, in shooting order within each session. */
export async function taggedPhotos(tag: string): Promise<LibraryPhoto[]> {
	return db
		.select({ id: imageTable.id, version: imageTable.version, sessionId: sessionTable.id, sessionName: sessionTable.name, editedAt: sql<null>`null`, snapshotId: latestSnapshotId })
		.from(imageTable)
		.innerJoin(imageToTagTable, eq(imageToTagTable.imageId, imageTable.id))
		.innerJoin(tagTable, eq(tagTable.id, imageToTagTable.tagId))
		.innerJoin(sessionTable, eq(sessionTable.id, imageTable.sessionId))
		.where(and(visible, eq(tagTable.name, tag)))
		.orderBy(desc(sessionTable.startedAt), asc(imageTable.recordedAt), asc(imageTable.id));
}
