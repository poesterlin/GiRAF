import { db } from '$lib/server/db';
import { imageTable } from '$lib/server/db/schema';
import { respondWithFile } from '$lib/server/utils';
import type { RequestHandler } from '@sveltejs/kit';
import { error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';

export const GET: RequestHandler = async ({ params }) => {
	const id = Number(params.id);

	const image = await db.query.imageTable.findFirst({
		where: eq(imageTable.id, id)
	});

	if (!image) {
		error(404, 'Image not found');
	}

	if (!image.tifPath || !(await Bun.file(image.tifPath).exists())) {
		error(404, 'Image was not imported properly');
	}

	const response = await respondWithFile(image.tifPath);

	// TIFF is immutable per image — cache aggressively
	response.headers.set('Cache-Control', 'public, max-age=31536000, immutable');

	return response;
};
