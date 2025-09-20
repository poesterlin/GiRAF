import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { sessionTable, snapshotTable } from '$lib/server/db/schema';
import { desc } from 'drizzle-orm';

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
				columns: { id: true, filepath: true, lastExportedAt: true },
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
		orderBy: [desc(sessionTable.startedAt)],
		limit: limit + 1,
		offset: cursor
	});

	let nextCursor: number | null = null;
	if (sessions.length > limit) {
		sessions.pop();
		nextCursor = cursor + limit;
	}

	const sessionsWithStatus = sessions.map((s) => {
		const imagesWithStatus = s.images.map((img) => {
			let needsExport = false;
			if (img.snapshots.length > 0) {
				if (!img.lastExportedAt) {
					needsExport = true;
				} else {
					needsExport = img.snapshots[0].createdAt > img.lastExportedAt;
				}
			}
			return { ...img, needsExport };
		});

		const hasImagesToExport = imagesWithStatus.some((img) => img.needsExport);
		const sessionStatus = hasImagesToExport ? 'Updated' : 'Exported';

		return {
			...s,
			startedAt: s.startedAt.toISOString(),
			endedAt: s.endedAt ? s.endedAt.toISOString() : null,
			images: imagesWithStatus.map((img) => ({ id: img.id, filepath: img.filepath, needsExport: img.needsExport })),
			albums: s.albums,
			status: sessionStatus
		};
	});

	const response = {
		sessions: sessionsWithStatus,
		next: nextCursor
	};

	return json(response);
};
