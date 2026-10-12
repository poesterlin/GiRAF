import { loadEditorImage } from '$lib/server/editor-data';
import { error } from '@sveltejs/kit';
import sharp from 'sharp';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const id = Number(params.img);
	const { image, snapshots } = await loadEditorImage(id);
	if (!image?.tifPath) error(404, 'Imported photo not found');
	const metadata = await sharp(image.tifPath).metadata();
	const exportScale = Math.max(1, image.resolutionX / metadata.width!, image.resolutionY / metadata.height!);
	return { image, snapshots, dimensions: { width: metadata.width!, height: metadata.height! }, maxRadius: Math.max(1, Math.floor(400 / exportScale)) };
};
