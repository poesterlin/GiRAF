import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { sessionTable } from '$lib/server/db/schema';
import { desc } from 'drizzle-orm';

export type SessionsResponse = {
	sessions: Array<{
		id: number;
		name: string;
		startedAt: Date;
		endedAt: Date | null;
		images: Array<{
			id: number;
			filename: string;
		}>;
	}>;
	next: number | null;
};

export const GET: RequestHandler = async ({ url }) => {
	const limit = 20;
	const cursor = Number(url.searchParams.get('cursor')) || 0;

	const sessions = await db.query.sessionTable.findMany({
		with: {
			images: {
				limit: 5, // Get up to 5 preview images per session
				columns: {
					id: true,
					filename: true
				}
			}
		},
		orderBy: [desc(sessionTable.startedAt)],
		limit: limit + 1, // Fetch one extra to check if there's a next page
		offset: cursor
	});

	let nextCursor: number | null = null;
	if (sessions.length > limit) {
		sessions.pop(); // remove the extra one
		nextCursor = cursor + limit;
	}

	// The dates from the DB are Date objects, need to stringify them.
	const sessionsWithStringDates = sessions.map((s) => ({
		...s,
		startedAt: s.startedAt.toISOString(),
		endedAt: s.endedAt ? s.endedAt.toISOString() : null,
        images: s.images
	}));

	const response = {
		sessions: sessionsWithStringDates,
		next: nextCursor
	};

	return json(response);
};
