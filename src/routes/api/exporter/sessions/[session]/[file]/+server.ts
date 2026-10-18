import { db } from '$lib/server/db';
import { sessionTable } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';
import { join } from 'path';
import { makeSessionPath } from '$lib/server/jobs/executor';
import { respondWithFile } from '$lib/server/utils';

export const GET: RequestHandler = async ({ params }) => {
	const { session: sessionId, file } = params;

	const session = await db.query.sessionTable.findFirst({
		where: eq(sessionTable.id, Number(sessionId))
	});

	if (!session) {
		error(404, { message: `Session with ID ${sessionId} not found.` });
	}

	const path = makeSessionPath(session);
	const filepath = join(path, file);

	// Re-exports overwrite the same file name, so never let a cache keep an old render
	return respondWithFile(filepath, 0);
};
