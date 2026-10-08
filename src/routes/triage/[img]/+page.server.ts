import { db } from '$lib/server/db';
import { imageTable, imageToTagTable } from '$lib/server/db/schema';
import { getBooleanSetting } from '$lib/server/db/settings';
import { error, redirect } from '@sveltejs/kit';
import { asc, eq } from 'drizzle-orm';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const triageEnabled = await getBooleanSetting('triage_enabled', true);
	if (!triageEnabled) {
		throw redirect(302, `/editor/${params.img}`);
	}

	const { img } = params;
	const imageId = Number(img);

	const image = await db.query.imageTable.findFirst({
		where: eq(imageTable.id, imageId)
	});

	if (!image) {
		error(404, { message: 'Image not found' });
	}

	const [sessionImages, imageTags, tags] = await Promise.all([
		db.query.imageTable.findMany({
			where: eq(imageTable.sessionId, image.sessionId),
			orderBy: [asc(imageTable.recordedAt), asc(imageTable.id)]
		}),
		db.query.imageToTagTable.findMany({
			where: eq(imageToTagTable.imageId, imageId),
			with: {
				tag: true
			}
		}),
		db.query.tagTable.findMany()
	]);

	const currentIndex = sessionImages.findIndex((i) => i.id === imageId);
	const nextImage = sessionImages[currentIndex + 1];
	const previousImage = sessionImages[currentIndex - 1];

	return {
		image,
		sessionImages,
		imageTags: imageTags.map((it) => it.tag),
		tags,
		nextImage: nextImage?.id,
		previousImage: previousImage?.id
	};
};
