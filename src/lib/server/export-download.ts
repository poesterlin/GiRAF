import { db } from '$lib/server/db';
import { sessionTable } from '$lib/server/db/schema';
import { jobManager } from '$lib/server/jobs/manager';
import { makeOutputPath } from '$lib/server/jobs/executor';
import { eq } from 'drizzle-orm';
import { stat } from 'node:fs/promises';

export async function getExportDownload(sessionId: number) {
	const session = await db.query.sessionTable.findFirst({
		where: eq(sessionTable.id, sessionId),
		with: { images: true }
	});
	if (!session) return null;
	const images = session.images.filter((image) => !image.isArchived);
	const exportSession = { ...session, images };
	const files = images.map((image) => makeOutputPath(image, exportSession));
	const exported = images.length > 0 && images.every((image) => image.lastExportedAt && image.lastExportedAt >= image.updatedAt);
	const available = exported && !jobManager.getActiveJobs().includes(sessionId) &&
		(await Promise.all(files.map((path) => stat(path).then((file) => file.isFile()).catch(() => false)))).every(Boolean);
	return { session, files, available };
}
