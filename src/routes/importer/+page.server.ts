import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import type { ImportResponse } from '../api/imports/+server';
import { db } from '$lib/server/db';
import { sessionTable } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

export const load: PageServerLoad = async ({ fetch }) => {
	const response = await fetch('/api/imports');

	if (!response.ok) {
		throw error(response.status, 'Could not fetch import sessions');
	}

	const initialData = await response.json() as ImportResponse;

	const sessions = await db.query.sessionTable.findMany({
		where: eq(sessionTable.isArchived, false),
		with: {
			images: {
				limit: 1,
				columns: {
					id: true
				}
			}
		},
		orderBy: (sessions, { desc }) => [desc(sessions.startedAt)],
	});

	return { ...initialData, sessions };
}
