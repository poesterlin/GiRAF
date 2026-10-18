import { db } from '$lib/server/db';
import { imageTable, snapshotTable } from '$lib/server/db/schema';
import type { EditorFilters } from '$lib/editor-filters';
import { and, desc, eq, exists, gt, isNotNull, isNull, lt, notExists, or, type SQL } from 'drizzle-orm';

/** Conditions selecting a session's photos for the editor navigation filter. */
export async function editorFilterConditions(sessionId: number, filters: EditorFilters): Promise<SQL[]> {
	const conditions: SQL[] = [eq(imageTable.sessionId, sessionId)];
	if (filters.newlyImported) {
		const latestExport = await db.query.imageTable.findFirst({
			where: and(eq(imageTable.sessionId, sessionId), isNotNull(imageTable.lastExportedAt)),
			columns: { lastExportedAt: true },
			orderBy: desc(imageTable.lastExportedAt)
		});
		if (latestExport?.lastExportedAt) conditions.push(gt(imageTable.createdAt, latestExport.lastExportedAt));
	}
	if (filters.archived !== 'any') conditions.push(eq(imageTable.isArchived, filters.archived === 'only'));
	const snapshotsOf = (condition?: SQL) =>
		db
			.select()
			.from(snapshotTable)
			.where(and(eq(snapshotTable.imageId, imageTable.id), condition));
	if (filters.show === 'todo') {
		// Unedited when the pass started, so photos finished since then stay reachable.
		conditions.push(notExists(snapshotsOf(filters.since ? lt(snapshotTable.createdAt, new Date(filters.since)) : undefined)));
	} else if (filters.show === 'edited') {
		conditions.push(exists(snapshotsOf()));
	} else if (filters.show === 'changed') {
		conditions.push(exists(snapshotsOf(or(isNull(imageTable.lastExportedAt), gt(snapshotTable.createdAt, imageTable.lastExportedAt)))));
	}
	return conditions;
}

/** Within a "To edit" list, a photo with any saved version was finished during the pass. */
export function finishedInPass(): SQL {
	return exists(db.select().from(snapshotTable).where(eq(snapshotTable.imageId, imageTable.id)));
}
