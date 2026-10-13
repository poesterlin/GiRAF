import { db } from '$lib/server/db';
import { imageTable, snapshotTable } from '$lib/server/db/schema';
import { editorFilterQuery, readEditorFilters } from '$lib/editor-filters';
import { error, redirect } from '@sveltejs/kit';
import { and, asc, count, desc, eq, exists, gt, isNull, isNotNull, lt, notExists, or } from 'drizzle-orm';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ params, url }) => {
	const selectedFilters = readEditorFilters(url.searchParams);
	if (selectedFilters.edited === 'edited' && selectedFilters.cutoff !== 'export' && !selectedFilters.since) {
		const query = new URLSearchParams(editorFilterQuery({ ...selectedFilters, since: new Date().toISOString() }).slice(1));
		for (const [key, value] of query) url.searchParams.set(key, value);
		url.searchParams.delete('filter');
		url.searchParams.delete('uneditedSince');
		redirect(307, url.pathname + url.search);
	}
	const image = await db.query.imageTable.findFirst({
		where: eq(imageTable.id, Number(params.img)),
		with: { session: { columns: { id: true, name: true } } }
	});
	if (!image) error(404, { message: 'Image or session not found' });
	const filters = [eq(imageTable.sessionId, image.sessionId)];
	if (selectedFilters.newlyImported) {
		const latestExport = await db.query.imageTable.findFirst({
			where: and(eq(imageTable.sessionId, image.sessionId), isNotNull(imageTable.lastExportedAt)),
			columns: { lastExportedAt: true }, orderBy: desc(imageTable.lastExportedAt)
		});
		if (latestExport?.lastExportedAt) filters.push(gt(imageTable.createdAt, latestExport.lastExportedAt));
	}
	if (selectedFilters.archived !== 'any') filters.push(eq(imageTable.isArchived, selectedFilters.archived === 'only'));
	if (selectedFilters.edited === 'unedited') {
		filters.push(notExists(db.select().from(snapshotTable).where(eq(snapshotTable.imageId, imageTable.id))));
	} else if (selectedFilters.edited === 'edited') {
		filters.push(exists(db.select().from(snapshotTable).where(and(
			eq(snapshotTable.imageId, imageTable.id),
			selectedFilters.cutoff !== 'export' ? lt(snapshotTable.createdAt, new Date(selectedFilters.since!))
				: or(isNull(imageTable.lastExportedAt), gt(snapshotTable.createdAt, imageTable.lastExportedAt))
		))));
	}
	const beforeCurrent = or(
		lt(imageTable.recordedAt, image.recordedAt), and(eq(imageTable.recordedAt, image.recordedAt), lt(imageTable.id, image.id))
	);
	const [totals, preceding, currentMatch, nextImage, previousImage, navigationImages] = await Promise.all([
		db.select({ total: count() }).from(imageTable).where(and(...filters)),
		db.select({ total: count() }).from(imageTable).where(and(...filters, beforeCurrent)),
		db.query.imageTable.findFirst({ columns: { id: true }, where: and(...filters, eq(imageTable.id, image.id)) }),
		db.query.imageTable.findFirst({ columns: { id: true }, where: and(...filters, or(
			gt(imageTable.recordedAt, image.recordedAt), and(eq(imageTable.recordedAt, image.recordedAt), gt(imageTable.id, image.id))
		)), orderBy: [asc(imageTable.recordedAt), asc(imageTable.id)] }),
		db.query.imageTable.findFirst({ columns: { id: true }, where: and(...filters, beforeCurrent), orderBy: [desc(imageTable.recordedAt), desc(imageTable.id)] }),
		db.query.imageTable.findMany({ columns: { id: true, name: true, version: true, isArchived: true }, where: and(...filters), orderBy: [asc(imageTable.recordedAt), asc(imageTable.id)] })
	]);
	return {
		session: image.session ?? null,
		navigationImages,
		hasMatchingImages: totals[0].total > 0,
		matchingImageCount: totals[0].total,
		currentImagePosition: currentMatch ? preceding[0].total + 1 : null,
		nextImage: nextImage?.id,
		previousImage: previousImage?.id
	};
};
