import { db } from '$lib/server/db';
import { imageToTagTable, profileTable } from '$lib/server/db/schema';
import { loadEditorImage } from '$lib/server/editor-data';
import { Glob } from 'bun';
import { desc, eq } from 'drizzle-orm';
import { join } from 'node:path';
import { env } from 'node:process';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const { img } = params;
	const imageId = Number(img);

	const [{ image, snapshots }, imageTags, tags, profiles] = await Promise.all([
		loadEditorImage(imageId),
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

	// load luts
	const cwd = env.CLUT_DIR;
	let luts: ReturnType<typeof formatLut>[] = [];

	if (cwd) {
		const glob = new Glob('**/*.png');
		const files = await Array.fromAsync(glob.scan({ cwd }));
		luts = files.map((f) => formatLut(f, cwd));
	}

	return {
		editorError:
			!image.tifPath || !(await Bun.file(image.tifPath).exists())
				? 'This photo has not finished processing. Its editor TIFF is missing. Reprocess the session in Gallery to prepare it for editing.'
				: null,
		luts,
		image,
		imageTags: imageTags.map((it) => it.tag) as { id: number; name: string }[],
		tags,
		snapshots,
		profiles
	};
};

function formatLut(path: string, cwd: string) {
	const folders = path.split('/');
	const name = folders.pop()?.replace(/\.png$/, '');

	return { name: name ?? 'Lut', path: join(cwd, path), tags: folders };
}
