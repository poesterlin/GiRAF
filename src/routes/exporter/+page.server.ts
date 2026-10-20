import { integrations } from '$lib/server/integrations';
import { fail } from '@sveltejs/kit';
import type { ExporterSessionsResponse } from '../api/exporter/sessions/+server';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { albumTable, sessionTable } from '$lib/server/db/schema';
import { and, eq } from 'drizzle-orm';

export const load: PageServerLoad = async ({ fetch }) => {
	const req = await fetch('/api/exporter/sessions');
	const data: ExporterSessionsResponse = await req.json();

	const configuredIntegrations = integrations.filter((i) => i.isConfigured() || i.canBeConfigured()).map((i) => i.type);
	// Only services whose API can list albums offer "link an existing album".
	const linkableIntegrations = integrations.filter((i) => i.isConfigured() && i.listAlbums).map((i) => i.type);

	return { ...data, configuredIntegrations, linkableIntegrations };
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
	'link-album': async ({ request }) => {
		const body = await request.formData();
		const sessionId = body.get('session') as string;
		const integrationType = body.get('integration') as string;
		const externalId = body.get('externalId') as string;

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

		if (!integration.listAlbums) {
			return fail(400, { error: `${integrationType} cannot link existing albums` });
		}

		if (!sessionId || isNaN(Number(sessionId))) {
			return fail(400, { error: 'Session is required' });
		}

		if (!externalId) {
			return fail(400, { error: 'Album is required' });
		}

		const [session] = await db
			.select()
			.from(sessionTable)
			.where(eq(sessionTable.id, Number(sessionId)))
			.limit(1);

		if (!session) {
			return fail(404, { error: 'Session not found' });
		}

		const alreadyLinked = await db
			.select({ id: albumTable.id })
			.from(albumTable)
			.where(and(eq(albumTable.sessionId, session.id), eq(albumTable.integration, integrationType), eq(albumTable.externalId, externalId)))
			.limit(1);

		if (alreadyLinked.length) {
			return fail(409, { error: 'This album is already linked to the session' });
		}

		let album;
		try {
			const albums = await integration.listAlbums();
			album = albums.find((candidate) => candidate.id === externalId);
		} catch (error) {
			console.error('Failed to look up album before linking', error);
			return fail(502, { error: 'Failed to reach the photo service' });
		}

		if (!album) {
			return fail(404, { error: 'Album not found on the photo service' });
		}

		try {
			await db.insert(albumTable).values({
				title: album.title,
				externalId: album.id,
				sessionId: session.id,
				integration: integrationType
			});
		} catch (error) {
			console.error('Failed to link album', error);
			return fail(500, { error: 'Failed to link album' });
		}

		console.log(`Linked existing album ${album.title} (${album.id}) to session ${session.id} on integration ${integrationType}`);
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
