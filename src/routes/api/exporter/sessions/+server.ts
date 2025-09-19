import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { sessionTable } from '$lib/server/db/schema';
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
		}>;
		albums: Array<{
			id: number;
			url: string | null;
			title: string | null;
			integration: string;
		}>;
		status: 'Updated' | 'Exported'; // Add status for exporter
	}>;
	next: number | null;
};

export const GET: RequestHandler = async ({ url }) => {
	const limit = 10; // Exporter can show more per page
	const cursor = Number(url.searchParams.get('cursor')) || 0;

	const sessions = await db.query.sessionTable.findMany({
		with: {
			images: {
				columns: { id: true, filepath: true },
				where: (images, { eq }) => eq(images.isArchived, false) // Only include non-archived images
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

	// Augment with mock status and serialize dates
	const sessionsWithStatus = sessions.map((s, i) => ({
		...s,
		startedAt: s.startedAt.toISOString(),
		endedAt: s.endedAt ? s.endedAt.toISOString() : null,
		images: s.images,
		albums: s.albums,
		status: i % 2 === 0 ? ('Updated' as 'Updated' | 'Exported') : ('Exported' as 'Updated' | 'Exported')
	}));

	const response = {
		sessions: sessionsWithStatus,
		next: nextCursor
	};

	return json(response);
};
