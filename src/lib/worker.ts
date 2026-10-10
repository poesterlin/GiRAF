/// <reference lib="webworker" />

console.log('[worker] Worker script loaded');

import { expose } from 'comlink';
import { fromBase64 } from './pp3-utils';
import { getRequiredClutPath, supportsWasmPreview, WASM_PREVIEW_PARITY_VERIFIED } from './preview-parity-policy';
import { renderNativePp3 } from './wasm-pp3-api';
import { supportsTiffColor } from './tiff-profile';
import { getRtWasm } from './wasm-module';

/** If this is set to true, the worker will use the most compatible code paths possible */
export const compatMode = import.meta.env.VITE_COMPAT_MODE === 'true';

const writelocks = new Set<string>();
const latestRequests = new Map<string, symbol>();

interface ClutOptions {
	clutData: Uint16Array;
	clutLevel: number;
}

// Reuse the active input allocation across edits instead of copying the TIFF
// into the WASM heap on every slider update.
let wasmInput: { module: any; data: Uint8Array; pointer: number } | null = null;
let wasmClut: { module: any; data: Uint16Array; pointer: number } | null = null;
let decodedImage: { module: any; data: Uint8Array; handle: number } | null = null;

function getDecodedImage(Module: any, data: Uint8Array): number {
	if (decodedImage && decodedImage.module === Module && decodedImage.data === data) return decodedImage.handle;
	if (decodedImage) {
		decodedImage.module._release_tiff_image(decodedImage.handle);
		decodedImage = null;
	}
	if (typeof Module._load_tiff_image !== 'function' || typeof Module._render_tiff_image !== 'function' || typeof Module._release_tiff_image !== 'function') return 0;
	const pointer = getWasmInput(Module, data);
	const handle = Module._load_tiff_image(pointer, data.length);
	if (!handle) throw new Error('Unable to decode WASM image');
	decodedImage = { module: Module, data, handle };
	// Decoding owns its pixels; no need to retain a second encoded TIFF in WASM.
	Module._free(pointer);
	wasmInput = null;
	return handle;
}

function getWasmClut(Module: any, data: Uint16Array): number {
	if (wasmClut && wasmClut.module === Module && wasmClut.data === data) return wasmClut.pointer;
	if (wasmClut) {
		wasmClut.module._free(wasmClut.pointer);
		wasmClut = null;
	}
	const pointer = Module._malloc(data.byteLength);
	if (!pointer) throw new Error('Unable to allocate WASM LUT input');
	try {
		Module.HEAPU8.set(new Uint8Array(data.buffer, data.byteOffset, data.byteLength), pointer);
		wasmClut = { module: Module, data, pointer };
		return pointer;
	} catch (error) {
		Module._free(pointer);
		throw error;
	}
}

function getWasmInput(Module: any, data: Uint8Array): number {
	if (wasmInput && wasmInput.module === Module && wasmInput.data === data) return wasmInput.pointer;
	if (wasmInput) {
		wasmInput.module._free(wasmInput.pointer);
		wasmInput = null;
	}
	const pointer = Module._malloc(data.length);
	if (!pointer) throw new Error('Unable to allocate WASM image input');
	try {
		Module.HEAPU8.set(data, pointer);
		wasmInput = { module: Module, data, pointer };
		return pointer;
	} catch (error) {
		Module._free(pointer);
		throw error;
	}
}

function wasmTiffToJpegWithPp3(Module: any, tiffData: Uint8Array, pp3String: string, quality: number, clut?: ClutOptions): Uint8Array {
	console.log(
		`[worker] WASM processing: tiff=${tiffData.length} bytes, pp3=${pp3String.length} chars, quality=${quality}, clut=${clut ? `level=${clut.clutLevel} entries=${clut.clutData.length}` : 'none'}`
	);

	const imageHandle = getDecodedImage(Module, tiffData);
	const tiffPtr = imageHandle ? 0 : getWasmInput(Module, tiffData);

	const pp3Bytes = new TextEncoder().encode(pp3String + '\0');
	const pp3Ptr = Module._malloc(pp3Bytes.length);
	Module.HEAPU8.set(pp3Bytes, pp3Ptr);

	try {
		const clutPtr = clut ? getWasmClut(Module, clut.clutData) : 0;
		let result: number;
		if (imageHandle) {
			result = Module._render_tiff_image(imageHandle, pp3Ptr, clutPtr, clut?.clutData.length ?? 0, clut?.clutLevel ?? 0, quality);
		} else if (clut && clutPtr) {
			console.log('[worker] Calling _tiff_to_jpeg_with_pp3_and_clut...');
			result = renderNativePp3(Module, tiffPtr, tiffData.length, pp3Ptr, quality, { pointer: clutPtr, count: clut.clutData.length, level: clut.clutLevel });
		} else {
			console.log('[worker] Calling _tiff_to_jpeg_with_pp3...');
			result = renderNativePp3(Module, tiffPtr, tiffData.length, pp3Ptr, quality);
		}
		console.log(`[worker] WASM returned: ${result}`);
		if (result !== 0) {
			throw new Error('WASM processing failed with code ' + result);
		}

		const outSize = Module._get_output_size();
		const outPtr = Module._get_output_data();
		console.log(`[worker] Output: ${outSize} bytes at ptr ${outPtr}`);
		const jpegData = new Uint8Array(Module.HEAPU8.buffer, outPtr, outSize).slice();
		Module._free_output();
		return jpegData;
	} finally {
		Module._free(pp3Ptr);
	}
}

// Keep only the active TIFF in memory: slider updates must not reread OPFS.
let activeTiff: { imageId: string; data: Promise<Uint8Array> } | null = null;

function getTiffData(imageId: string): Promise<Uint8Array> {
	if (activeTiff?.imageId === imageId) return activeTiff.data;
	const data = loadTiffData(imageId);
	activeTiff = { imageId, data };
	void data.catch(() => {
		if (activeTiff?.data === data) activeTiff = null;
	});
	return data;
}

async function loadTiffData(imageId: string): Promise<Uint8Array> {
	// Check OPFS cache first
	const fileName = `${imageId}.tif`;
	try {
		const fileHandle = await getFileHandle('tiffs', fileName);
		const file = await fileHandle.getFile();
		if (file.size > 0) {
			console.log(`[worker] TIFF cache hit for ${imageId} (${file.size} bytes)`);
			return new Uint8Array(await file.arrayBuffer());
		}
	} catch {
		// not cached yet
	}

	// Fetch from server and cache
	console.log(`[worker] Fetching TIFF for ${imageId} from server...`);
	const res = await fetch(`/api/images/${imageId}/tiff`);
	if (!res.ok || !res.body) {
		throw new Error(`Failed to fetch TIFF for ${imageId}: ${res.status} ${res.statusText}`);
	}

	const bytes = new Uint8Array(await res.arrayBuffer());
	try {
		await storeFile(new Blob([bytes]).stream(), 'tiffs', fileName);
	} catch (error) {
		console.warn('[worker] Unable to cache TIFF; using memory:', error);
	}
	return bytes;
}

// Cache parsed CLUT data by path
const clutCache = new Map<string, { clutData: Uint16Array; clutLevel: number }>();

async function getClutData(clutPath: string): Promise<ClutOptions> {
	const cached = clutCache.get(clutPath);
	if (cached) {
		clutCache.delete(clutPath);
		clutCache.set(clutPath, cached);
		console.log(`[worker] CLUT cache hit for ${clutPath}`);
		return cached;
	}

	console.log(`[worker] Fetching CLUT data for ${clutPath}...`);
	const res = await fetch(`/api/luts/clut?path=${encodeURIComponent(clutPath)}`);
	if (!res.ok) {
		throw new Error(`Failed to fetch CLUT: ${res.status} ${res.statusText}`);
	}

	const level = Number(res.headers.get('X-Clut-Level'));
	const buffer = await res.arrayBuffer();
	const clutData = new Uint16Array(buffer);
	if (!Number.isInteger(level) || level < 2 || clutData.length !== level ** 3 * 4) {
		throw new Error('Invalid LUT data received');
	}
	const result = { clutData, clutLevel: level };

	console.log(`[worker] CLUT fetched: level=${level}, entries=${clutData.length}`);
	clutCache.set(clutPath, result);
	while (clutCache.size > 4) {
		clutCache.delete(clutCache.keys().next().value!);
	}
	return result;
}

async function refreshImageWasm(imageId: string, config: string): Promise<{ url: string; error: boolean }> {
	console.log(`[worker] refreshImageWasm: imageId=${imageId}`);
	const pp3String = fromBase64(config);
	const clutPath = getRequiredClutPath(pp3String);
	// Initialization, source download/profile validation and LUT loading are
	// independent. Start them together rather than adding their latencies.
	const [Module, tiffData, clut] = await Promise.all([
		getRtWasm(),
		getTiffData(imageId).then(async (data) => {
			if (!(await supportsTiffColor(data))) throw new Error('TIFF color profile requires reference rendering');
			return data;
		}),
		clutPath ? getClutData(clutPath) : Promise.resolve(undefined)
	]);

	const t0 = performance.now();
	const jpegData = wasmTiffToJpegWithPp3(Module, tiffData, pp3String, 85, clut);
	console.log(`[worker] WASM processing took ${(performance.now() - t0).toFixed(1)}ms`);

	const blob = new Blob([jpegData as BlobPart], { type: 'image/jpeg' });
	const url = URL.createObjectURL(blob);
	console.log(`[worker] WASM preview done for ${imageId}, jpeg=${jpegData.length} bytes`);
	return { url, error: false };
}

async function refreshImageServer(imageId: string, config: string, version: number): Promise<{ url: string; error: boolean }> {
	console.log(`[worker] refreshImageServer: imageId=${imageId}, version=${version}`);
	const res = await fetch(`/api/images/${imageId}/edit?config=${encodeURIComponent(config)}&v=${version}`);
	if (!res.ok) throw new Error(`Reference preview failed: ${res.status} ${res.statusText}`);
	return { url: URL.createObjectURL(await res.blob()), error: false };
}

async function refreshImage(imageId: string, config: string, version = 0) {
	const request = Symbol();
	latestRequests.set(imageId, request);
	console.log(`[worker] refreshImage: imageId=${imageId}, version=${version}`);
	while (writelocks.has(imageId)) {
		console.log(`[worker] Waiting for writelock on ${imageId}...`);
		await new Promise((res) => setTimeout(res, 10));
	}

	// Requests superseded while another render was active need no processing.
	if (latestRequests.get(imageId) !== request) return { url: '', error: false };

	writelocks.add(imageId);

	try {
		if (compatMode || !WASM_PREVIEW_PARITY_VERIFIED || !supportsWasmPreview(fromBase64(config))) return await refreshImageServer(imageId, config, version);
		// Try WASM-first, fall back to server
		try {
			const result = await refreshImageWasm(imageId, config);
			console.log(`[worker] refreshImage done (WASM) for ${imageId}`);
			return result;
		} catch (wasmError) {
			console.warn('[worker] WASM preview failed, falling back to server:', wasmError);
			const result = await refreshImageServer(imageId, config, version);
			console.log(`[worker] refreshImage done (server fallback) for ${imageId}`);
			return result;
		}
	} catch (error) {
		console.error('[worker] Error in refreshImage:', error);
		return { url: `/api/images/${imageId}/edit?config=${encodeURIComponent(config)}`, error: true };
	} finally {
		writelocks.delete(imageId);
		if (latestRequests.get(imageId) === request) latestRequests.delete(imageId);
	}
}

async function getFileHandle(folder: string, fileName: string) {
	// Get the root directory handle
	const root = await navigator.storage.getDirectory();
	const directoryHandle = await root.getDirectoryHandle(folder, { create: true });

	// Attempt to get the file handle for the medium's content file
	const fileHandle = await directoryHandle.getFileHandle(fileName, { create: true });
	if (!fileHandle) {
		throw new Error(`File handle for ${fileName} not found in ${folder}`);
	}

	return fileHandle;
}

async function storeFile(body: NonNullable<Response['body']>, folder: string, fileName: string) {
	try {
		const fileHandle = await getFileHandle(folder, fileName);

		// Write the file to OPFS
		if ('createWritable' in fileHandle) {
			const writable = await fileHandle.createWritable();
			await body.pipeTo(writable);

			// closing not necessary, as it is done automatically by the stream
		} else {
			const writable = await (fileHandle as any).createSyncAccessHandle();
			const arrayBuffer = await new Response(body).arrayBuffer();
			writable.truncate(0);
			writable.write(arrayBuffer);
			writable.close();
		}

		// No need to append to index, the media is part of the article now
		// await appendToIndex(articleId);

		return fileHandle;
	} catch (error) {
		console.error('Failed to store file:', error);
		throw error;
	}
}

const methods = {
	refreshImage
};

export type ImageWorker = typeof methods;

expose(methods);
