import { env } from '$env/dynamic/private';
import type { RequestHandler } from '@sveltejs/kit';
import { error } from '@sveltejs/kit';
import { loadClut } from '$lib/server/clut';

export const GET: RequestHandler = async ({ url }) => {
	const lutPath = url.searchParams.get('path');
	if (!lutPath) {
		error(400, 'Missing path parameter');
	}

	// Security: ensure the path is within CLUT_DIR
	const clutDir = env.CLUT_DIR;
	if (!clutDir || !lutPath.startsWith(clutDir)) {
		error(403, 'Invalid LUT path');
	}

	const file = Bun.file(lutPath);
	if (!(await file.exists())) {
		error(404, 'LUT file not found');
	}

	let clut;
	try {
		clut = await loadClut(lutPath);
	} catch {
		error(400, 'Unable to decode HaldCLUT');
	}
	return new Response(Buffer.from(clut.clutData.buffer), {
		headers: {
			'Content-Type': 'application/octet-stream',
			'Cache-Control': 'public, max-age=31536000, immutable',
			'X-Clut-Level': String(clut.clutLevel)
		}
	});
};
