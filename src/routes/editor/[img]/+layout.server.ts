import { db } from '$lib/server/db';
import { imageTable } from '$lib/server/db/schema';
import { editorFilterQuery, readEditorFilters } from '$lib/editor-filters';
import { editorFilterConditions, finishedInPass } from '$lib/server/editor-filter-conditions';
import { error, redirect } from '@sveltejs/kit';
import { and, asc, count, desc, eq, gt, lt, or } from 'drizzle-orm';
import type { LayoutServerLoad } from './$types';

const filterKeys = ['show', 'since', 'archived', 'imported', 'edited', 'cutoff', 'filter', 'uneditedSince'];

export const load: LayoutServerLoad = async ({ params, url }) => {
	const selectedFilters = readEditorFilters(url.searchParams);
	const canonical = editorFilterQuery({ ...selectedFilters, ...(selectedFilters.show === 'todo' && !selectedFilters.since ? { since: new Date().toISOString() } : {}) });
	// Pin a new "To edit" pass to now, and rewrite older filter links to the current form.
	if (filterKeys.some((key) => url.searchParams.has(key)) || canonical) {
		const rewritten = new URL(url);
		for (const key of filterKeys) rewritten.searchParams.delete(key);
		for (const [key, value] of new URLSearchParams(canonical.slice(1))) rewritten.searchParams.set(key, value);
		if (rewritten.search !== url.search) redirect(307, rewritten.pathname + rewritten.search);
	}
	const image = await db.query.imageTable.findFirst({
		where: eq(imageTable.id, Number(params.img)),
		with: { session: { columns: { id: true, name: true } } }
	});
	if (!image) error(404, { message: 'Image or session not found' });
	const filters = await editorFilterConditions(image.sessionId, selectedFilters);
	const beforeCurrent = or(lt(imageTable.recordedAt, image.recordedAt), and(eq(imageTable.recordedAt, image.recordedAt), lt(imageTable.id, image.id)));
	const [totals, preceding, [currentMatch], [nextImage], [previousImage], navigationImages, finished] = await Promise.all([
		db
			.select({ total: count() })
			.from(imageTable)
			.where(and(...filters)),
		db
			.select({ total: count() })
			.from(imageTable)
			.where(and(...filters, beforeCurrent)),
		// Plain selects: the filters' snapshot subqueries refer to the unaliased image table.
		db
			.select({ id: imageTable.id })
			.from(imageTable)
			.where(and(...filters, eq(imageTable.id, image.id)))
			.limit(1),
		db
			.select({ id: imageTable.id })
			.from(imageTable)
			.where(and(...filters, or(gt(imageTable.recordedAt, image.recordedAt), and(eq(imageTable.recordedAt, image.recordedAt), gt(imageTable.id, image.id)))))
			.orderBy(asc(imageTable.recordedAt), asc(imageTable.id))
			.limit(1),
		db
			.select({ id: imageTable.id })
			.from(imageTable)
			.where(and(...filters, beforeCurrent))
			.orderBy(desc(imageTable.recordedAt), desc(imageTable.id))
			.limit(1),
		db
			.select({ id: imageTable.id, name: imageTable.name, version: imageTable.version, isArchived: imageTable.isArchived })
			.from(imageTable)
			.where(and(...filters))
			.orderBy(asc(imageTable.recordedAt), asc(imageTable.id)),
		selectedFilters.show === 'todo'
			? db
					.select({ id: imageTable.id })
					.from(imageTable)
					.where(and(...filters, finishedInPass()))
			: Promise.resolve([])
	]);
	return {
		session: image.session ?? null,
		navigationImages,
		/** Photos in a "To edit" list that were finished during the pass. */
		finishedImageIds: finished.map(({ id }) => id),
		hasMatchingImages: totals[0].total > 0,
		matchingImageCount: totals[0].total,
		currentImagePosition: currentMatch ? preceding[0].total + 1 : null,
		nextImage: nextImage?.id,
		previousImage: previousImage?.id
	};
};
