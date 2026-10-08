import { fromBase64, stringifyPP3 } from '$lib/pp3-utils';
import { db } from '$lib/server/db';
import { imageTable } from '$lib/server/db/schema';
import { editImage } from '$lib/server/image-editor';
import { respondWithFile } from '$lib/server/utils';
import type { RequestHandler } from '@sveltejs/kit';
import { error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';

export const GET: RequestHandler = async ({ params, url }) => {
	const id = Number(params.id);

	const image = await db.query.imageTable.findFirst({
		where: eq(imageTable.id, id)
	});

	if (!image) {
		error(404, 'Image not found');
	}

	try {
		const config = url.searchParams.get('config');
		const isPreview = url.searchParams.has('preview');

		const pp3String = config ? fromBase64(config) : stringifyPP3({});

		if (!image.tifPath || !(await Bun.file(image.tifPath).exists())) {
			// TODO: import image if it doesn't exist, instead of just throwing an error
			error(404, 'Image was not imported properly');
		}

		const output = await editImage(image.tifPath, pp3String, {
			allowConcurrent: isPreview,
			quality: 85
		});
		return respondWithFile(output);
	} catch (err) {
		console.error('Error editing image:', err);
		error(400, {
			message: 'Failed to edit image'
		});
	}
};
