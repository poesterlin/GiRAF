import type { RequestHandler } from './$types';
import { getExportDownload } from '$lib/server/export-download';
import archiver from 'archiver';
import { basename } from 'node:path';
import { PassThrough, Readable } from 'node:stream';

export const GET: RequestHandler = async ({ params, request }) => {
	const id = Number(params.id);
	if (!Number.isSafeInteger(id) || id <= 0) return new Response('Invalid session ID', { status: 400 });
	const exported = await getExportDownload(id);
	if (!exported) return new Response('Session not found', { status: 404 });
	if (!exported.available) return new Response('Session export is not ready for download', { status: 409 });

	const archive = archiver('zip', { store: true });
	const output = new PassThrough();
	archive.on('error', (error) => output.destroy(error));
	archive.on('warning', (error) => output.destroy(error));
	archive.pipe(output);
	const abort = () => { archive.abort(); output.destroy(); };
	request.signal.addEventListener('abort', abort, { once: true });
	output.on('close', () => {
		request.signal.removeEventListener('abort', abort);
		archive.abort();
	});
	for (const path of exported.files) archive.file(path, { name: basename(path) });
	void archive.finalize().catch((error) => output.destroy(error));

	return new Response(Readable.toWeb(output) as unknown as ReadableStream<Uint8Array>, {
		headers: {
			'Content-Type': 'application/zip',
			'Content-Disposition': `attachment; filename="session-${id}-export.zip"`,
			'Cache-Control': 'no-store'
		}
	});
};
