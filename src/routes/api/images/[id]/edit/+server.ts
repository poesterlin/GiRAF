import { fromBase64, stringifyPP3 } from '$lib/pp3-utils';
import { editorPreview } from '$lib/server/editor-preview';
import { db } from '$lib/server/db';
import { imageTable } from '$lib/server/db/schema';
import { editImage } from '$lib/server/image-editor';
import { respondWithFile } from '$lib/server/utils';
import type { RequestHandler } from '@sveltejs/kit';
import { error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';

const refinements = new Map<string, AbortController>();

export const GET: RequestHandler = async ({ params, url, request }) => {
	const id = Number(params.id);
	const stage = url.searchParams.get('stage');
	const client = request.headers.get('X-Preview-Client');
	const clientKey = client && /^[a-f0-9-]{36}$/.test(client) ? client : null;
	// Prioritize the next normal preview even if a client disconnect isn't
	// propagated by the HTTP adapter immediately.
	if (clientKey && stage === 'quick') refinements.get(clientKey)?.abort();

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

		if (stage === 'quick' || stage === 'final') {
			const refinement = stage === 'final' ? new AbortController() : null;
			if (clientKey && refinement) {
				refinements.get(clientKey)?.abort();
				refinements.set(clientKey, refinement);
			}
			try {
				const signal = refinement ? AbortSignal.any([request.signal, refinement.signal]) : request.signal;
				const jpeg = await editorPreview(image.tifPath, image.filepath, pp3String, url.searchParams.get('device'), stage, signal);
				return new Response(new Uint8Array(jpeg), { headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, max-age=3600' } });
			} finally {
				if (clientKey && refinements.get(clientKey) === refinement) refinements.delete(clientKey);
			}
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
