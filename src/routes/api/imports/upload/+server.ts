import type { RequestHandler } from '@sveltejs/kit';
import { uploadFiles } from '$lib/server/upload';

export const POST: RequestHandler = async ({ request }) => {
	const form = await request.formData();
	return uploadFiles(form.getAll('files') as File[]);
};
