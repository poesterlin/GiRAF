import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { imageTable, sessionTable, snapshotTable } from '$lib/server/db/schema';
import { and, desc, eq, max, sql } from 'drizzle-orm';
import { findExportPath } from '$lib/server/export-files';
import { stat } from 'node:fs/promises';

export type ExporterSessionsResponse = {
	sessions: Array<{
		id: number;
		name: string;
		startedAt: string;
		endedAt: string | null;
		images: Array<{
			id: number;
			filepath: string;
			needsExport: boolean;
		}>;
		albums: Array<{
			id: number;
			url: string | null;
			title: string | null;
			integration: string;
		}>;
		status: 'Updated' | 'Exported';
	}>;
	next: number | null;
};

export const GET: RequestHandler = async ({ url }) => {
	const limit = 10;
	const cursor = Number(url.searchParams.get('cursor')) || 0;

	const sessions = await db.query.sessionTable.findMany({
		with: {
			images: {
				columns: { id: true, filepath: true, lastExportedAt: true, updatedAt: true, recordedAt: true },
				where: (images, { eq }) => eq(images.isArchived, false),
				with: {
					snapshots: {
						orderBy: [desc(snapshotTable.createdAt)],
						limit: 1
					}
				}
			},
			albums: {
				columns: {
					id: true,
					url: true,
					title: true,
					integration: true,
					externalId: true
				}
			}
		},
		orderBy: (sessions) => {
			const lastEdit = db.select({ date: max(snapshotTable.createdAt) })
				.from(snapshotTable)
				.innerJoin(imageTable, eq(imageTable.id, snapshotTable.imageId))
				.where(and(eq(imageTable.sessionId, sessions.id), eq(imageTable.isArchived, false)));
			return [sql`${lastEdit} desc nulls last`, desc(sessions.startedAt), desc(sessions.id)];
		},
		where: eq(sessionTable.isArchived, false),
		limit: limit + 1,
		offset: cursor
	});

	let nextCursor: number | null = null;
	if (sessions.length > limit) {
		sessions.pop();
		nextCursor = cursor + limit;
	}

	const sessionsWithStatus = await Promise.all(sessions.map(async (s) => {
		const imagesWithStatus = await Promise.all(s.images.map(async (img) => {
			const path = await findExportPath(img, s);
			const exists = await stat(path).then((file) => file.isFile()).catch(() => false);
			const needsExport = !img.lastExportedAt || img.updatedAt > img.lastExportedAt || !exists;
			return { ...img, needsExport };
		}));

		const hasImagesToExport = imagesWithStatus.some((img) => img.needsExport);
		const sessionStatus = hasImagesToExport ? 'Updated' : 'Exported';

		return {
			...s,
			images: imagesWithStatus.map((img) => ({ id: img.id, filepath: img.filepath, needsExport: img.needsExport })),
			albums: s.albums,
			status: sessionStatus
		};
	}));

	const response = {
		sessions: sessionsWithStatus,
		next: nextCursor
	};

	return json(response);
};
