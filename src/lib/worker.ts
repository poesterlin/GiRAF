/// <reference lib="webworker" />

import { expose } from 'comlink';

/** If this is set to true, the worker will use the most compatible code paths possible */
export const compatMode = import.meta.env.VITE_COMPAT_MODE === 'true';

const writelocks = new Set<string>();

async function refreshImage(imageId: string, config: string) {
    while (writelocks.has(imageId)) {
        await new Promise(res => setTimeout(res, 10));
    }

    writelocks.add(imageId);

    try {
        const res = await fetch(`/api/images/${imageId}/edit?config=${config}`);

        let fileHandle: FileSystemFileHandle;
        if (res.ok && res.body) {
            fileHandle = await storeFile(res.body, 'images', `${imageId}.jpg`);
        } else {
            // If the fetch fails, we try to get the file handle from the OPFS
            fileHandle = await getFileHandle('images', `${imageId}.jpg`);
        }

        const file = await fileHandle.getFile();
        return { url: URL.createObjectURL(file), error: !res.ok };
    } catch (error) {
        console.error("Error in refreshImage:", error);
        throw error;
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