import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { integrations } from '$lib/server/integrations';

const ASSET_ID = /^[A-Za-z0-9_-]{1,128}$/;

export const GET: RequestHandler = async ({ params }) => {
	const integration = integrations.find((i) => i.type === params.integration);
	if (!integration) {
		error(404, 'Integration not found');
	}

	if (!integration.isConfigured()) {
		error(400, 'Integration not configured');
	}

	if (!integration.getAlbumThumbnail) {
		error(404, 'Integration does not support album thumbnails');
	}

	if (!ASSET_ID.test(params.assetId)) {
		error(400, 'Invalid asset ID');
	}

	let res: Response;
	try {
		res = await integration.getAlbumThumbnail(params.assetId);
	} catch (cause) {
		console.error(`Failed to load ${integration.type} album thumbnail`, cause);
		error(502, 'Could not load album thumbnail');
	}

	return new Response(res.body, {
		headers: {
			'content-type': res.headers.get('content-type') ?? 'image/jpeg',
			'cache-control': 'private, max-age=300'
		}
	});
};
