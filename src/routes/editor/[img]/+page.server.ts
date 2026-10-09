import { db } from '$lib/server/db';
import { imageTable, imageToTagTable, profileTable, snapshotTable } from '$lib/server/db/schema';
import { error, redirect } from '@sveltejs/kit';
import { Glob } from 'bun';
import { and, asc, desc, eq, exists, gt, isNull, lt, notExists, or } from 'drizzle-orm';
import { join } from 'node:path';
import { env } from 'node:process';
import type { PageServerLoad } from './$types';
import { editorFilterQuery, readEditorFilters } from '$lib/editor-filters';

export const load: PageServerLoad = async ({ params, url }) => {
	const selectedFilters = readEditorFilters(url.searchParams);
	if (selectedFilters.edited !== 'any' && selectedFilters.cutoff === 'workflow' && !selectedFilters.since) {
		const query = new URLSearchParams(editorFilterQuery({ ...selectedFilters, since: new Date().toISOString() }).slice(1));
		for (const [key, value] of query) url.searchParams.set(key, value);
		url.searchParams.delete('filter');
		url.searchParams.delete('uneditedSince');
		redirect(307, url.pathname + url.search);
	}
	const { img } = params;
	const imageId = Number(img);

	const [image, snapshots, imageTags, tags, profiles] = await Promise.all([
		db.query.imageTable.findFirst({
			where: eq(imageTable.id, imageId),
		}),
		db.query.snapshotTable.findMany({
			where: eq(snapshotTable.imageId, imageId),
			orderBy: desc(snapshotTable.createdAt)
		}),
		db.query.imageToTagTable.findMany({
			where: eq(imageToTagTable.imageId, imageId),
			with: {
				tag: true
			}
		}),
		db.query.tagTable.findMany(),
		db.query.profileTable.findMany({
			orderBy: desc(profileTable.createdAt)
		})
	]);

	if (!image) {
		error(404, { message: 'Image or session not found' });
	}

	// load luts
	const cwd = env.CLUT_DIR;
	let luts: ReturnType<typeof formatLut>[] = [];
	
	if (cwd) {
		const glob = new Glob('**/*.png');
		const files = await Array.fromAsync(glob.scan({ cwd }));
		luts = files.map((f) => formatLut(f, cwd));
	}

	const filters = [eq(imageTable.sessionId, image.sessionId)];
	if (selectedFilters.archived !== 'any') filters.push(eq(imageTable.isArchived, selectedFilters.archived === 'only'));
	if (selectedFilters.edited !== 'any') {
		const edits = db.select().from(snapshotTable).where(and(
			eq(snapshotTable.imageId, imageTable.id),
			selectedFilters.cutoff === 'workflow'
				? lt(snapshotTable.createdAt, new Date(selectedFilters.since!))
				: or(isNull(imageTable.lastExportedAt), gt(snapshotTable.createdAt, imageTable.lastExportedAt))
		));
		filters.push(selectedFilters.edited === 'edited' ? exists(edits) : notExists(edits));
	}

	// find next image in line
	const [matchingImage] = await db
		.select({ id: imageTable.id })
		.from(imageTable)
		.where(and(...filters))
		.limit(1);

	const [nextImage] = await db
		.select({ id: imageTable.id })
		.from(imageTable)
		.where(and(gt(imageTable.recordedAt, image.recordedAt), ...filters))
		.orderBy(asc(imageTable.recordedAt))
		.limit(1);

	// find previous image in line
	const [previousImage] = await db
		.select({ id: imageTable.id })
		.from(imageTable)
		.where(and(lt(imageTable.recordedAt, image.recordedAt), ...filters))
		.orderBy(desc(imageTable.recordedAt))
		.limit(1);

	return {
		hasMatchingImages: !!matchingImage,
		luts,
		image,
		imageTags: imageTags.map((it) => it.tag) as { id: number; name: string }[],
		tags,
		snapshots,
		profiles,
		nextImage: nextImage?.id,
		previousImage: previousImage?.id
	};
};

function formatLut(path: string, cwd: string) {
	const folders = path.split('/');
	const name = folders.pop()?.replace(/\.png$/, '');

	return { name: name ?? 'Lut', path: join(cwd, path), tags: folders };
}
