import { json, type RequestHandler } from '@sveltejs/kit';
import { and, count } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { imageTable } from '$lib/server/db/schema';
import { readEditorFilters } from '$lib/editor-filters';
import { editorFilterConditions } from '$lib/server/editor-filter-conditions';

/** How many photos a filter would show, so the filter dialog can preview its result. */
export const GET: RequestHandler = async ({ params, url }) => {
	const filters = readEditorFilters(url.searchParams);
	if (filters.show === 'todo' && !filters.since) filters.since = new Date().toISOString();
	const conditions = await editorFilterConditions(Number(params.id), filters);
	const [{ total }] = await db.select({ total: count() }).from(imageTable).where(and(...conditions));
	return json({ count: total });
};
