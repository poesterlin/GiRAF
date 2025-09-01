import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import type { ImportResponse } from '../api/imports/+server';
import { db } from '$lib/server/db';
import { imageTable, importTable, sessionTable, type Image } from '$lib/server/db/schema';
import { inArray } from 'drizzle-orm';

export const load: PageServerLoad = async ({ fetch }) => {
	const response = await fetch('/api/imports');

	if (!response.ok) {
		throw error(response.status, 'Could not fetch import sessions');
	}

	const initialData = await response.json() as ImportResponse;
	return initialData;
}

