import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { integrations } from '$lib/server/integrations';
import { db } from '$lib/server/db';
import { albumTable, sessionTable } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

/** Shape shared by the album lookup endpoint and the exporter UI. */
export type AlbumLookupResponse = {
	albums: Array<{
		id: string;
		title: string;
		assetCount: number;
		updatedAt: string | null;
		thumbnailUrl: string | null;
		linkedSessions: Array<{ id: number; name: string }>;
	}>;
	supported: boolean;
};

export const GET: RequestHandler = async ({ params, url }) => {
	const integration = integrations.find((i) => i.type === params.integration);
	if (!integration) {
		error(404, 'Integration not found');
	}

	if (!integration.isConfigured()) {
		error(400, 'Integration not configured');
	}

	if (!integration.listAlbums) {
		return json({ albums: [], supported: false } satisfies AlbumLookupResponse);
	}

	const query = url.searchParams.get('query') ?? '';

	let albums;
	try {
		albums = await integration.listAlbums(query);
	} catch (cause) {
		console.error(`Failed to look up ${integration.type} albums`, cause);
		error(502, `Could not load albums from ${integration.type}`);
	}

	const links = await db
		.select({
			externalId: albumTable.externalId,
			sessionId: albumTable.sessionId,
			sessionName: sessionTable.name
		})
		.from(albumTable)
		.leftJoin(sessionTable, eq(sessionTable.id, albumTable.sessionId))
		.where(eq(albumTable.integration, integration.type));

	const linkedByAlbum = new Map<string, Array<{ id: number; name: string }>>();
	for (const link of links) {
		if (link.sessionId === null) continue;
		const existing = linkedByAlbum.get(link.externalId) ?? [];
		existing.push({ id: link.sessionId, name: link.sessionName ?? 'Unknown session' });
		linkedByAlbum.set(link.externalId, existing);
	}

	return json({
		albums: albums.map((album) => ({
			id: album.id,
			title: album.title,
			assetCount: album.assetCount,
			updatedAt: album.updatedAt,
			thumbnailUrl: album.thumbnailAssetId ? `/api/integrations/${integration.type}/albums/lookup/thumbnail/${encodeURIComponent(album.thumbnailAssetId)}` : null,
			linkedSessions: linkedByAlbum.get(album.id) ?? []
		})),
		supported: true
	} satisfies AlbumLookupResponse);
};
