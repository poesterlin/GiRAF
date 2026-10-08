import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { readdir } from 'node:fs/promises';
import { makeSessionPath } from '$lib/server/jobs/executor';
import { eq } from 'drizzle-orm';
import { sessionTable } from '$lib/server/db/schema';
import { db } from '$lib/server/db';
import { getExportDownload } from '$lib/server/export-download';

export const load: PageServerLoad = async ({ params, depends }) => {
	depends('exporter:session');
	const sessionId = Number(params.session);

	const session = await db.query.sessionTable.findFirst({
		where: eq(sessionTable.id, sessionId),
		with: { images: { columns: { id: true } } }
	});

	if (!session) {
		error(404, { message: `Session with ID ${sessionId} not found.` });
	}

	const images = await readdir(makeSessionPath(session)).then((files) => files.filter((file) => file.endsWith('.jpg')).sort()).catch((cause: NodeJS.ErrnoException) => {
		if (cause.code === 'ENOENT') return [];
		throw cause;
	});

	return {
		session,
		images,
		imageIds: Object.fromEntries(images.flatMap((filename) => {
			const id = Number(filename.match(/^(\d+)_/)?.[1]);
			return session.images.some((image) => image.id === id) ? [[filename, id]] : [];
		})),
		downloadReady: (await getExportDownload(sessionId))?.available ?? false
	};
};
