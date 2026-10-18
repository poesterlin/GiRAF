import { integrations } from '$lib/server/integrations';
import { fail } from '@sveltejs/kit';
import type { ExporterSessionsResponse } from '../api/exporter/sessions/+server';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { albumTable, sessionTable } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

export const load: PageServerLoad = async ({ fetch }) => {
	const req = await fetch('/api/exporter/sessions');
	const data: ExporterSessionsResponse = await req.json();

	const configuredIntegrations = integrations.filter((i) => i.isConfigured() || i.canBeConfigured()).map((i) => i.type);

	return { ...data, configuredIntegrations };
};

export const actions: Actions = {
	'create-album': async ({ request }) => {
		const body = await request.formData();
		const sessionId = body.get('session') as string;
		const integrationType = body.get('integration') as string;

		const integration = integrations.find((i) => i.type === integrationType);

		if (!integration) {
			return fail(400, { error: 'Integration not found' });
		}

		if (!integration.isConfigured()) {
			if (integration.canBeConfigured()) {
				return integration.configure();
			}

			return fail(400, { error: 'Integration not configured' });
		}
		if (!sessionId || isNaN(Number(sessionId))) {
			return fail(400, { error: 'Session is required' });
		}

		const [session] = await db
			.select()
			.from(sessionTable)
			.where(eq(sessionTable.id, Number(sessionId)))
			.limit(1);

		if (!session) {
			return fail(404, { error: 'Session not found' });
		}

		const year = new Date(session.startedAt).getFullYear();
		const title = `${session.name} - ${year}`;

		try {
			const { id, url } = await integration.createAlbum(title);
			await db.insert(albumTable).values({
				title,
				externalId: id,
				url,
				sessionId: session.id,
				integration: integrationType
			});
		} catch (error) {
			console.error('Failed to create album', error);
			return fail(500, { error: 'Failed to create album' });
		}

		console.log(`Created album ${title} for session ${session.id} on integration ${integrationType}`);
	},
	'delete-album': async ({ request }) => {
		const body = await request.formData();
		const albumId = body.get('id') as string;

		if (!albumId || isNaN(Number(albumId))) {
			return fail(400, { error: 'Album ID is required' });
		}

		try {
			await db.delete(albumTable).where(eq(albumTable.id, Number(albumId)));
		} catch (error) {
			console.error('Failed to delete album', error);
			return fail(500, { error: 'Failed to delete album' });
		}

		console.log(`Deleted album ${albumId}`);
	}
};
