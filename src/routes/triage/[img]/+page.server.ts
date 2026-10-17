import { db } from '$lib/server/db';
import { imageTable, imageToTagTable, snapshotTable } from '$lib/server/db/schema';
import { getBooleanSetting } from '$lib/server/db/settings';
import { ensurePhashes } from '$lib/server/phash';
import { error, redirect } from '@sveltejs/kit';
import { asc, desc, eq } from 'drizzle-orm';
import type { TriageImage } from '$lib/similar-images';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const triageEnabled = await getBooleanSetting('triage_enabled', true);
	if (!triageEnabled) {
		throw redirect(302, `/editor/${params.img}`);
	}

	const { img } = params;
	const imageId = Number(img);

	const image = await db.query.imageTable.findFirst({
		where: eq(imageTable.id, imageId),
		with: { session: { columns: { id: true, name: true } } }
	});

	if (!image) {
		error(404, { message: 'Image not found' });
	}

	const [sessionImages, imageTags, tags, snapshot] = await Promise.all([
		db.query.imageTable.findMany({
			where: eq(imageTable.sessionId, image.sessionId),
			orderBy: [asc(imageTable.recordedAt), asc(imageTable.id)],
			columns: { id: true, isArchived: true, version: true, recordedAt: true, phash: true, name: true, exposure: true, aperture: true, iso: true, previewPath: true }
		}),
		db.query.imageToTagTable.findMany({
			where: eq(imageToTagTable.imageId, imageId),
			with: {
				tag: true
			}
		}),
		db.query.tagTable.findMany(),
		db.query.snapshotTable.findFirst({
			where: eq(snapshotTable.imageId, imageId),
			orderBy: [desc(snapshotTable.createdAt), desc(snapshotTable.id)],
			columns: { id: true }
		})
	]);

	await ensurePhashes(sessionImages);

	// The page only needs a few fields per photo; the rest would be serialised into every triage page
	const sessionStrip: TriageImage[] = sessionImages.map(({ previewPath: _previewPath, ...rest }) => rest);

	const currentIndex = sessionImages.findIndex((i) => i.id === imageId);
	const nextImage = sessionImages[currentIndex + 1];
	const previousImage = sessionImages[currentIndex - 1];

	return {
		image,
		session: image.session ?? null,
		snapshotId: snapshot?.id,
		sessionImages: sessionStrip,
		imageTags: imageTags.map((it) => it.tag),
		tags,
		nextImage: nextImage?.id,
		previousImage: previousImage?.id
	};
};
