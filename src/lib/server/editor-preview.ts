import { createHash } from 'node:crypto';
import { dirname } from 'node:path';
import { rm, stat } from 'node:fs/promises';
import { previewQuality, type PreviewStage } from '$lib/editor-preview-policy';
import { editImage, generateExportTif, mapCropFromPreviewToExport } from './image-editor';
import { parsePP3, stringifyPP3 } from '$lib/pp3-utils';

const MAX_CACHE_BYTES = 32 * 1024 * 1024;
const CACHE_LIFETIME = 60_000;
const renders = new Map<string, { jpeg: Buffer; expires: number }>();
let cacheBytes = 0;

type FullSource = { path: string; users: number; used: number };
const fullSources = new Map<string, FullSource>();

async function pruneSources() {
	for (const [key, entry] of fullSources) {
		if (!entry.users && (fullSources.size > 2 || Date.now() - entry.used > 600_000)) {
			fullSources.delete(key);
			await rm(dirname(entry.path), { recursive: true, force: true });
		}
	}
}

async function acquireSource(rawPath: string, signal: AbortSignal): Promise<FullSource> {
	await pruneSources();
	const source = await stat(rawPath);
	const key = `${rawPath}:${source.mtimeMs}:${source.size}`;
	let entry = fullSources.get(key);
	if (!entry) {
		const path = await generateExportTif(rawPath, { signal });
		if (signal.aborted) {
			await rm(dirname(path), { recursive: true, force: true });
			signal.throwIfAborted();
		}
		// Concurrent clients may finish the same RAW source independently.
		entry = fullSources.get(key);
		if (entry) await rm(dirname(path), { recursive: true, force: true });
		else {
			entry = { path, users: 0, used: Date.now() };
			fullSources.set(key, entry);
		}
	}
	entry.users++;
	entry.used = Date.now();
	return entry;
}

function remove(key: string) {
	const entry = renders.get(key);
	if (entry) cacheBytes -= entry.jpeg.byteLength;
	renders.delete(key);
}

/** Keep the initial reference render unchanged; refine only once edits settle. */
export async function editorPreview(path: string, rawPath: string, pp3: string, device: string | null, stage: PreviewStage, signal: AbortSignal, cacheOnly = false) {
	const started = performance.now();
	const timings = { source: 0, mapping: 0, render: 0, read: 0, total: 0 };
	let sourceCache = 'unused';
	signal.throwIfAborted();
	const source = await stat(path);
	const { quality, size } = previewQuality(device, stage);
	const rawSource = stage === 'final' && size > 1000 ? await stat(rawPath) : null;
	const key = createHash('sha256').update(`${path}:${source.mtimeMs}:${source.size}:${rawSource?.mtimeMs}:${rawSource?.size}:${pp3}:${quality}:${size}`).digest('hex');
	for (const [key, entry] of renders) {
		if (entry.expires <= Date.now()) remove(key);
	}
	let jpeg = renders.get(key)?.jpeg;
	// Cache probes must never prepare a source or start a RawTherapee process.
	if (cacheOnly && !jpeg) return null;
	const cacheHit = !!jpeg;
	if (jpeg) {
		const entry = renders.get(key)!;
		renders.delete(key);
		renders.set(key, entry);
	} else {
		let fullSource: FullSource | undefined;
		let output: string | undefined;
		try {
			let input = path;
			let profile = pp3;
			if (stage === 'final' && size > 1000) {
				const sourceStarted = performance.now();
				const sourceKey = `${rawPath}:${rawSource!.mtimeMs}:${rawSource!.size}`;
				sourceCache = fullSources.has(sourceKey) ? 'hit' : 'miss';
				fullSource = await acquireSource(rawPath, signal);
				timings.source = performance.now() - sourceStarted;
				input = fullSource.path;
				const mappingStarted = performance.now();
				const settings = await mapCropFromPreviewToExport(parsePP3(pp3), path, input);
				timings.mapping = performance.now() - mappingStarted;
				signal.throwIfAborted();
				settings.Resize = { Enabled: true, AppliesTo: 'Cropped area', Method: 'Lanczos', DataSpecified: 3, Width: size, Height: size, LongEdge: size, ShortEdge: size, AllowUpscaling: false };
				profile = stringifyPP3(settings);
			}
			const renderStarted = performance.now();
			output = await editImage(input, profile, { quality, signal });
			timings.render = performance.now() - renderStarted;
			const readStarted = performance.now();
			jpeg = Buffer.from(await Bun.file(output).arrayBuffer());
			timings.read = performance.now() - readStarted;
			signal.throwIfAborted();
			if (jpeg.byteLength <= MAX_CACHE_BYTES) {
				remove(key);
				while (cacheBytes + jpeg.byteLength > MAX_CACHE_BYTES && renders.size) remove(renders.keys().next().value!);
				renders.set(key, { jpeg, expires: Date.now() + CACHE_LIFETIME });
				cacheBytes += jpeg.byteLength;
			}
		} finally {
			if (output) await rm(dirname(output), { recursive: true, force: true });
			if (fullSource) {
				fullSource.users--;
				fullSource.used = Date.now();
				await pruneSources();
			}
		}
	}
	signal.throwIfAborted();
	timings.total = performance.now() - started;
	return { jpeg, timings, cacheHit, sourceCache };
}
