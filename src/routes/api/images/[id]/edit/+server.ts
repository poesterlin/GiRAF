import { fromBase64, stringifyPP3 } from '$lib/pp3-utils';
import { editorPreview } from '$lib/server/editor-preview';
import { db } from '$lib/server/db';
import { imageTable } from '$lib/server/db/schema';
import { editImage } from '$lib/server/image-editor';
import { respondWithFile } from '$lib/server/utils';
import type { RequestHandler } from '@sveltejs/kit';
import { error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';

const refinements = new Map<string, AbortController>();

async function withRefinement<T>(clientKey: string | null, signal: AbortSignal, render: (signal: AbortSignal) => Promise<T>): Promise<T> {
	const controller = new AbortController();
	if (clientKey) {
		refinements.get(clientKey)?.abort();
		refinements.set(clientKey, controller);
	}
	try {
		return await render(AbortSignal.any([signal, controller.signal]));
	} finally {
		if (clientKey && refinements.get(clientKey) === controller) refinements.delete(clientKey);
	}
}

function previewResponse(result: Awaited<ReturnType<typeof editorPreview>>, requestId: string, cacheOnly: boolean, timings: Record<string, number>) {
	if (!result) return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store', 'X-Preview-Request': requestId } });
	return new Response(new Uint8Array(result.jpeg), { headers: {
		'Content-Type': 'image/jpeg', 'Cache-Control': cacheOnly ? 'no-store' : 'private, max-age=3600',
		'Server-Timing': Object.entries(timings).map(([name, duration]) => `${name};dur=${duration.toFixed(1)}`).join(', '),
		'X-Preview-Cache': result.cacheHit ? 'hit' : 'miss',
		'X-Preview-Request': requestId,
		'X-Preview-Source-Cache': result.sourceCache
	} });
}

export const GET: RequestHandler = async ({ params, url, request }) => {
	const requestStarted = performance.now();
	const incomingRequestId = request.headers.get('X-Preview-Request');
	const requestId = incomingRequestId && /^[a-f0-9-]{36}$/.test(incomingRequestId) ? incomingRequestId : crypto.randomUUID();
	const diagnostics: Record<string, string | number | boolean> = { requestId, stage: url.searchParams.get('stage') || 'legacy', outcome: 'error' };
	const id = Number(params.id);
	const stage = url.searchParams.get('stage');
	const cacheOnly = stage === 'final' && url.searchParams.get('cacheOnly') === '1';
	diagnostics.cacheOnly = cacheOnly;
	const client = request.headers.get('X-Preview-Client');
	const clientKey = client && /^[a-f0-9-]{36}$/.test(client) ? client : null;
	// Prioritize the next normal preview even if a client disconnect isn't
	// propagated by the HTTP adapter immediately.
	if (clientKey && stage === 'quick') refinements.get(clientKey)?.abort();

	const image = await db.query.imageTable.findFirst({
		where: eq(imageTable.id, id)
	});
	const databaseMs = performance.now() - requestStarted;

	if (!image) {
		error(404, 'Image not found');
	}

	try {
		const config = url.searchParams.get('config');

		const pp3String = config ? fromBase64(config) : stringifyPP3({});

		if (!image.tifPath || !(await Bun.file(image.tifPath).exists())) {
			// TODO: import image if it doesn't exist, instead of just throwing an error
			error(404, 'Image was not imported properly');
		}

		if (stage === 'quick' || stage === 'final') {
			const render = (signal: AbortSignal) => editorPreview(image.tifPath!, image.filepath, pp3String, url.searchParams.get('device'), stage, signal, cacheOnly);
			const result = stage === 'final' && !cacheOnly
				? await withRefinement(clientKey, request.signal, render)
				: await render(request.signal);
			const timings = { database: databaseMs, ...result?.timings, request: performance.now() - requestStarted };
			diagnostics.outcome = result ? 'success' : 'cache-miss';
			if (result) Object.assign(diagnostics, timings, { jpegCache: result.cacheHit, sourceCache: result.sourceCache, bytes: result.jpeg.byteLength });
			return previewResponse(result, requestId, cacheOnly, timings);
		}
		const renderStarted = performance.now();
		const output = await editImage(image.tifPath, pp3String, {
			quality: 85
		});
		const response = await respondWithFile(output);
		diagnostics.outcome = 'success';
		response.headers.set('X-Preview-Request', requestId);
		response.headers.set('Server-Timing', `database;dur=${databaseMs.toFixed(1)}, render;dur=${(performance.now() - renderStarted).toFixed(1)}, request;dur=${(performance.now() - requestStarted).toFixed(1)}`);
		return response;
	} catch (err) {
		diagnostics.outcome = request.signal.aborted || (err instanceof Error && err.name === 'AbortError') ? 'cancelled' : 'error';
		console.error('Error editing image:', err);
		error(400, {
			message: 'Failed to edit image'
		});
	} finally {
		console.info('[preview-render]', JSON.stringify({ ...diagnostics, elapsedMs: Math.round(performance.now() - requestStarted) }));
	}
};
