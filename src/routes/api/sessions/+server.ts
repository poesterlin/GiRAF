import { db } from '$lib/server/db';
import { imageTable, sessionTable, snapshotTable } from '$lib/server/db/schema';
import { jobManager } from '$lib/server/jobs/manager';
import { JobType } from '$lib/server/jobs/types';
import { buildJSONColumn } from '$lib/server/utils';
import { json } from '@sveltejs/kit';
import { count, desc, eq, exists, max, sql, type SQL } from 'drizzle-orm';
import type { RequestHandler } from './$types';

export type SessionSort = 'upload' | 'recorded' | 'edit';

export type SessionsResponse = {
	sessions: Array<{
		id: number;
		name: string;
		startedAt: Date;
		endedAt: Date | null;
		isImporting: boolean;
		isExporting: boolean;
		imageCount: number;
		images: Array<{
			id: number;
			version: number;
			hasSnapshot: boolean;
			snapshotId: number | null;
			isArchived: boolean;
		}>;
	}>;
	next: number | null;
};

export const GET: RequestHandler = async ({ url }) => {
	const limit = 20;
	const cursor = Number(url.searchParams.get('cursor')) || 0;
	const sessionId = Number(url.searchParams.get('session'));
	const singleSession = Number.isSafeInteger(sessionId) && sessionId > 0;
	const sortParam = url.searchParams.get('sort');
	const sort: SessionSort = sortParam === 'recorded' || sortParam === 'edit' ? sortParam : 'upload';

	const lastEditedAt = sql`max((select max(${snapshotTable.createdAt}) from ${snapshotTable} where ${snapshotTable.imageId} = ${imageTable.id}))`;
	const orderBy =
		sort === 'recorded'
			? [desc(sessionTable.startedAt), sql`${max(imageTable.recordedAt)} desc nulls last`, desc(sessionTable.id)]
			: sort === 'edit'
				? [sql`${lastEditedAt} desc nulls last`, sql`${max(imageTable.createdAt)} desc nulls last`, desc(sessionTable.startedAt), desc(sessionTable.id)]
				: [sql`${max(imageTable.createdAt)} desc nulls last`, desc(sessionTable.startedAt), desc(sessionTable.id)];

	const sessions = await db
		.select({
			id: sessionTable.id,
			name: sessionTable.name,
			startedAt: sessionTable.startedAt,
			endedAt: sessionTable.endedAt,
			imageCount: count(sql`case when ${imageTable.isArchived} = false then ${imageTable.id} end`).as('imageCount'),
			images: buildJSONColumn(
				{
					id: imageTable.id,
					version: imageTable.version,
					isArchived: imageTable.isArchived,
					hasSnapshot: exists(db.select().from(snapshotTable).where(eq(snapshotTable.imageId, imageTable.id))) as SQL<boolean>,
					snapshotId: sql<
						number | null
					>`(select ${snapshotTable.id} from ${snapshotTable} where ${snapshotTable.imageId} = ${imageTable.id} order by ${snapshotTable.createdAt} desc, ${snapshotTable.id} desc limit 1)`
				},
				[imageTable.recordedAt]
			)
		})
		.from(sessionTable)
		.leftJoin(imageTable, eq(imageTable.sessionId, sessionTable.id))
		.where(singleSession ? eq(sessionTable.id, sessionId) : eq(sessionTable.isArchived, false))
		.groupBy(sessionTable.id)
		.orderBy(...orderBy)
		.limit(singleSession ? 1 : limit + 1) // Fetch one extra to check if there's a next page
		.offset(singleSession ? 0 : cursor);

	let nextCursor: number | null = null;
	if (!singleSession && sessions.length > limit) {
		sessions.pop(); // remove the extra one
		nextCursor = cursor + limit;
	}

	// The dates from the DB are Date objects, need to stringify them.
	const sessionsWithStringDates = sessions.map((s) => ({
		...s,
		images: singleSession ? s.images : s.images.filter((img) => !img.isArchived).slice(0, 4),
		isImporting: jobManager.getActiveJobType(s.id) === JobType.IMPORT,
		isExporting: jobManager.getActiveJobType(s.id) === JobType.EXPORT
	}));

	const response = {
		sessions: sessionsWithStringDates,
		next: nextCursor
	};

	return json(response);
};
