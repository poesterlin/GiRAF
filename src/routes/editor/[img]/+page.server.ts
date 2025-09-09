import { db } from '$lib/server/db';
import { imageTable, imageToTagTable, snapshotTable, type Image, profileTable } from '$lib/server/db/schema';
import { error } from '@sveltejs/kit';
import { Glob } from 'bun';
import { and, asc, desc, eq, gt, lt } from 'drizzle-orm';
import { join } from 'node:path';
import { env } from 'node:process';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
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
	const glob = new Glob('**/*.png');
	const cwd = env.CLUT_DIR;
	let luts: ReturnType<typeof formatLut>[] = [];

	if (cwd) {
		const files = await Array.fromAsync(glob.scan({ cwd }));
		luts = files.map((f) => formatLut(f, cwd));
	}

	// find next image in line
	const [nextImage] = await db
		.select({ id: imageTable.id })
		.from(imageTable)
		.where(and(gt(imageTable.id, Number(img)), eq(imageTable.sessionId, image.sessionId)))
		.orderBy(asc(imageTable.id))
		.limit(1);

	// find previous image in line
	const [previousImage] = await db
		.select({ id: imageTable.id })
		.from(imageTable)
		.where(and(lt(imageTable.id, Number(img)), eq(imageTable.sessionId, image.sessionId)))
		.orderBy(desc(imageTable.id))
		.limit(1);

	return {
		luts,
		image: image as Image,
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
