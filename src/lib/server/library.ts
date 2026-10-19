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

const latestSnapshotId = sql<
	number | null
>`(select ${snapshotTable.id} from ${snapshotTable} where ${snapshotTable.imageId} = ${imageTable.id} order by ${snapshotTable.createdAt} desc, ${snapshotTable.id} desc limit 1)`;
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

export type ArchivedSession = { id: number; name: string; startedAt: string; imageCount: number; totalImageCount: number; cover: LibraryPhoto[] };

export async function archivedSessionCount(): Promise<number> {
	const [{ total }] = await db.select({ total: count() }).from(sessionTable).where(eq(sessionTable.isArchived, true));
	return total;
}

/** A cover is usable while its preview or its source file still exists; the preview route regenerates from the source. */
async function coverExists(photo: { previewPath: string | null; filepath: string }): Promise<boolean> {
	return (photo.previewPath ? await Bun.file(photo.previewPath).exists() : false) || Bun.file(photo.filepath).exists();
}

/** Archived sessions with a few photos each, so they can be recognised before restoring. */
export async function archivedSessions(): Promise<ArchivedSession[]> {
	const sessions = await db
		.select({
			id: sessionTable.id,
			name: sessionTable.name,
			startedAt: sessionTable.startedAt,
			imageCount: count(sql`case when ${imageTable.isArchived} = false then ${imageTable.id} end`),
			totalImageCount: count(imageTable.id)
		})
		.from(sessionTable)
		.leftJoin(imageTable, eq(imageTable.sessionId, sessionTable.id))
		.where(eq(sessionTable.isArchived, true))
		.groupBy(sessionTable.id)
		.orderBy(desc(sessionTable.startedAt), desc(sessionTable.id));
	return Promise.all(
		sessions.map(async (session) => {
			// Archived sessions can outlive their files, so read a few extra candidates and keep the ones still on disk.
			const candidates = await db
				.select({
					id: imageTable.id,
					version: imageTable.version,
					sessionId: imageTable.sessionId,
					sessionName: sql<string>`${session.name}`,
					editedAt: sql<null>`null`,
					snapshotId: latestSnapshotId,
					previewPath: imageTable.previewPath,
					filepath: imageTable.filepath
				})
				.from(imageTable)
				.where(and(eq(imageTable.sessionId, session.id), eq(imageTable.isArchived, false)))
				.orderBy(asc(imageTable.recordedAt), asc(imageTable.id))
				.limit(8);
			const cover: LibraryPhoto[] = [];
			for (const candidate of candidates) {
				if (cover.length === 4) break;
				const { previewPath, filepath, ...photo } = candidate;
				if (await coverExists({ previewPath, filepath })) cover.push(photo);
			}
			return { ...session, startedAt: new Date(session.startedAt).toISOString(), cover };
		})
	);
}
