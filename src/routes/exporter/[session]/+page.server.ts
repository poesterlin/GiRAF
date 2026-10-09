import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { readdir } from 'node:fs/promises';
import { makeSessionPath } from '$lib/server/jobs/executor';
import { eq } from 'drizzle-orm';
import { sessionTable } from '$lib/server/db/schema';
import { db } from '$lib/server/db';
import { getExportDownload } from '$lib/server/export-download';
import { exportImageId } from '$lib/server/export-files';

export const load: PageServerLoad = async ({ params, depends }) => {
	depends('exporter:session');
	const sessionId = Number(params.session);

	const session = await db.query.sessionTable.findFirst({
		where: eq(sessionTable.id, sessionId),
		with: { images: true }
	});

	if (!session) {
		error(404, { message: `Session with ID ${sessionId} not found.` });
	}

	const recordingDates = new Map(session.images.map((image) => [image.id, image.recordedAt.getTime()]));
	const images = await readdir(makeSessionPath(session)).then((files) => files.filter((file) => file.endsWith('.jpg')).sort((a, b) => {
		const aDate = recordingDates.get(exportImageId(a) ?? -1) ?? Infinity;
		const bDate = recordingDates.get(exportImageId(b) ?? -1) ?? Infinity;
		return aDate - bDate || a.localeCompare(b);
	})).catch((cause: NodeJS.ErrnoException) => {
		if (cause.code === 'ENOENT') return [];
		throw cause;
	});

	return {
		session,
		images,
		imageIds: Object.fromEntries(images.flatMap((filename) => {
			const id = exportImageId(filename);
			return session.images.some((image) => image.id === id) ? [[filename, id]] : [];
		})),
		downloadReady: (await getExportDownload(sessionId))?.available ?? false
	};
};
