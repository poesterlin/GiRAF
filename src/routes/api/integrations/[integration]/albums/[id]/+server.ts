import { error, redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { integrations } from '$lib/server/integrations';
import { db } from '$lib/server/db';
import { albumTable } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

export const GET: RequestHandler = async (event) => {
	const { params } = event;

	const integration = integrations.find((i) => i.type === params.integration);
	if (!integration) {
		error(404, 'Integration not found');
	}

	if (!integration.isConfigured()) {
		error(400, 'Integration not configured');
	}

	const id = parseInt(params.id);
	const [album] = await db.select().from(albumTable).where(eq(albumTable.id, id)).limit(1);
	if (!album) {
		error(404, 'Album not found');
	}

	const link = integration.getLinkToAlbum(album);
	redirect(307, link);
};
