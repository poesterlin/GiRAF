import { json, error, type RequestHandler } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { rename, stat } from 'node:fs/promises';
import { db } from '$lib/server/db';
import { sessionTable } from '$lib/server/db/schema';
import { makeSessionPath } from '$lib/server/export-files';
import { jobManager } from '$lib/server/jobs/manager';
import { JobType } from '$lib/server/jobs/types';

export const PATCH: RequestHandler = async ({ params, request }) => {
	const body = await request.json().catch(() => error(400, 'Invalid JSON'));
	const name = typeof body?.name === 'string' ? body.name.trim() : '';
	if (!name || /[\/\\\x00]/.test(name) || name === '.' || name === '..') error(400, 'Enter a valid session name.');
	const id = Number(params.id);
	const session = await db.query.sessionTable.findFirst({ where: eq(sessionTable.id, id) });
	if (!session) error(404, 'Session not found');
	if (jobManager.getActiveJobType(id) === JobType.EXPORT) error(409, 'Wait for the export to finish before renaming this session.');
	if (jobManager.getActiveJobs().includes(id)) error(409, 'Wait for session processing to finish before renaming.');
	const oldPath = makeSessionPath(session);
	const newPath = makeSessionPath({ ...session, name });
	let moved = false;
	if (oldPath !== newPath) {
		let exists = false;
		try { await stat(oldPath); exists = true; } catch (cause) {
			if ((cause as NodeJS.ErrnoException).code !== 'ENOENT') throw cause;
		}
		if (exists) {
			try { await stat(newPath); error(409, 'An export folder with that name already exists.'); } catch (cause) {
				if ((cause as NodeJS.ErrnoException).code !== 'ENOENT') throw cause;
			}
			await rename(oldPath, newPath);
			moved = true;
		}
	}
	try {
		await db.update(sessionTable).set({ name }).where(eq(sessionTable.id, id));
	} catch (cause) {
		if (moved) await rename(newPath, oldPath);
		throw cause;
	}
	return json({ id, name });
};
