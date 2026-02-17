/// <reference lib="webworker" />

console.log('[worker] Worker script loaded');

import { expose } from 'comlink';

/** If this is set to true, the worker will use the most compatible code paths possible */
export const compatMode = import.meta.env.VITE_COMPAT_MODE === 'true';

const writelocks = new Set<string>();

// WASM singleton — initialized once
let rtPromise: Promise<any> | null = null;

function getRtWasm() {
    if (!rtPromise) {
        console.log('[worker] Loading WASM module...');
        // Load from static/ to avoid Vite bundling the WASM module's pthread worker
        rtPromise = fetch('/rt-wasm.js').then(r => r.text()).then(async (jsText) => {
            const blob = new Blob([jsText], { type: 'application/javascript' });
            const blobUrl = URL.createObjectURL(blob);
            const mod = await import(/* @vite-ignore */ blobUrl);
            URL.revokeObjectURL(blobUrl);
            console.log('[worker] WASM JS loaded, creating module...');
            const createModule = mod.default;
            const Module = await createModule({
                locateFile: (path: string) => '/' + path
            });
            console.log('[worker] Module created, awaiting ready...');
            await Module.ready;
            console.log('[worker] WASM module ready');
            return Module;
        }).catch((err) => {
            console.error('[worker] Failed to load WASM module:', err);
            rtPromise = null;
            throw err;
        });
    }
    return rtPromise;
}

interface ClutOptions {
    clutData: Uint16Array;
    clutLevel: number;
}

function wasmTiffToJpegWithPp3(Module: any, tiffData: Uint8Array, pp3String: string, quality: number, clut?: ClutOptions): Uint8Array {
    console.log(`[worker] WASM processing: tiff=${tiffData.length} bytes, pp3=${pp3String.length} chars, quality=${quality}, clut=${clut ? `level=${clut.clutLevel} entries=${clut.clutData.length}` : 'none'}`);

    const tiffPtr = Module._malloc(tiffData.length);
    Module.HEAPU8.set(tiffData, tiffPtr);

    const pp3Bytes = new TextEncoder().encode(pp3String + '\0');
    const pp3Ptr = Module._malloc(pp3Bytes.length);
    Module.HEAPU8.set(pp3Bytes, pp3Ptr);

    let clutPtr = 0;
    if (clut) {
        const clutBytes = clut.clutData.byteLength;
        clutPtr = Module._malloc(clutBytes);
        Module.HEAPU8.set(new Uint8Array(clut.clutData.buffer, clut.clutData.byteOffset, clutBytes), clutPtr);
    }

    try {
        let result: number;
        if (clut && clutPtr) {
            console.log('[worker] Calling _tiff_to_jpeg_with_pp3_and_clut...');
            result = Module._tiff_to_jpeg_with_pp3_and_clut(tiffPtr, tiffData.length, pp3Ptr, quality, clutPtr, clut.clutData.length, clut.clutLevel);
        } else {
            console.log('[worker] Calling _tiff_to_jpeg_with_pp3...');
            result = Module._tiff_to_jpeg_with_pp3(tiffPtr, tiffData.length, pp3Ptr, quality);
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
        Module._free(tiffPtr);
        Module._free(pp3Ptr);
        if (clutPtr) Module._free(clutPtr);
    }
}

async function getTiffData(imageId: string): Promise<Uint8Array> {
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

    const fileHandle = await storeFile(res.body, 'tiffs', fileName);
    const file = await fileHandle.getFile();
    console.log(`[worker] TIFF fetched and cached for ${imageId} (${file.size} bytes)`);
    return new Uint8Array(await file.arrayBuffer());
}

// Cache parsed CLUT data by path
const clutCache = new Map<string, { clutData: Uint16Array; clutLevel: number }>();

function parseClutFilenameFromPp3(pp3String: string): string | null {
    const match = pp3String.match(/ClutFilename=(.+)/);
    return match?.[1]?.trim() || null;
}

async function getClutData(clutPath: string): Promise<ClutOptions> {
    const cached = clutCache.get(clutPath);
    if (cached) {
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
    const result = { clutData, clutLevel: level };

    console.log(`[worker] CLUT fetched: level=${level}, entries=${clutData.length}`);
    clutCache.set(clutPath, result);
    return result;
}

async function refreshImageWasm(imageId: string, config: string): Promise<{ url: string; error: boolean }> {
    console.log(`[worker] refreshImageWasm: imageId=${imageId}`);
    const Module = await getRtWasm();
    const tiffData = await getTiffData(imageId);

    const pp3String = atob(config);

    // Check if PP3 has a Film Simulation CLUT
    let clut: ClutOptions | undefined;
    const clutPath = parseClutFilenameFromPp3(pp3String);
    if (clutPath) {
        try {
            clut = await getClutData(clutPath);
        } catch (err) {
            console.warn('[worker] Failed to load CLUT, proceeding without:', err);
        }
    }

    const t0 = performance.now();
    const jpegData = wasmTiffToJpegWithPp3(Module, tiffData, pp3String, 85, clut);
    console.log(`[worker] WASM processing took ${(performance.now() - t0).toFixed(1)}ms`);

    const blob = new Blob([jpegData as BlobPart], { type: 'image/jpeg' });
    const fileHandle = await getFileHandle('images', `${imageId}.jpg`);
    if ('createWritable' in fileHandle) {
        const writable = await fileHandle.createWritable();
        await writable.write(blob);
        await writable.close();
    } else {
        const writable = await (fileHandle as any).createSyncAccessHandle();
        writable.truncate(0);
        writable.write(await blob.arrayBuffer());
        writable.close();
    }

    const file = await fileHandle.getFile();
    const url = URL.createObjectURL(file);
    console.log(`[worker] WASM preview done for ${imageId}, jpeg=${jpegData.length} bytes`);
    return { url, error: false };
}

async function refreshImageServer(imageId: string, config: string, version: number): Promise<{ url: string; error: boolean }> {
    console.log(`[worker] refreshImageServer: imageId=${imageId}, version=${version}`);
    const res = await fetch(`/api/images/${imageId}/edit?config=${config}&v=${version}`);

    let fileHandle: FileSystemFileHandle;
    if (res.ok && res.body) {
        fileHandle = await storeFile(res.body, 'images', `${imageId}.jpg`);
    } else {
        fileHandle = await getFileHandle('images', `${imageId}.jpg`);
    }

    const file = await fileHandle.getFile();
    return { url: URL.createObjectURL(file), error: !res.ok };
}

async function refreshImage(imageId: string, config: string, version = 0) {
    console.log(`[worker] refreshImage: imageId=${imageId}, version=${version}`);
    while (writelocks.has(imageId)) {
        console.log(`[worker] Waiting for writelock on ${imageId}...`);
        await new Promise(res => setTimeout(res, 10));
    }

    writelocks.add(imageId);

    try {
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
        console.error("[worker] Error in refreshImage:", error);
       return { url: `/api/images/${imageId}/edit?config=${config}`, error: true };
    } finally {
        writelocks.delete(imageId);
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

async function storeFile(body: NonNullable<Response["body"]>, folder: string, fileName: string) {
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
        console.error("Failed to store file:", error);
        throw error;
    }
}

const methods = {
    refreshImage
};

export type ImageWorker = typeof methods;

expose(methods);