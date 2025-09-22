import path from 'path';
import fs from 'fs/promises'; // Use fs/promises for async operations
import { Glob } from 'bun';

const supportedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.tif', '.tiff', '.arw', '.nef', '.cr2', '.raf'];

const env = process.env as Record<string, string>;
const IMPORT_DIR = env.IMPORT_DIR;
const SD_CARD_IMPORT_PATH = '/app/sd-card-import';
const EDITOR_API_URL = env.EDITOR_API_URL || 'http://localhost:3000/api/imports/run-import';
const POLLING_INTERVAL_MS = 5000;

let isProcessingSdCard = false;
const processedSdCardFiles = new Set<string>(); // In-memory cache of processed files

if (!IMPORT_DIR) {
    throw new Error('IMPORT_DIR environment variable is not set.');
}

console.log(`[SD_CARD_IMPORTER] IMPORT_DIR: ${IMPORT_DIR}`);
if (SD_CARD_IMPORT_PATH) {
    console.log(`[SD_CARD_IMPORTER] SD_CARD_IMPORT_PATH: ${SD_CARD_IMPORT_PATH}`);
} else {
    console.warn(`[SD_CARD_IMPORTER] SD_CARD_IMPORT_PATH is not set. SD card import will be disabled.`);
}
console.log(`[SD_CARD_IMPORTER] EDITOR_API_URL: ${EDITOR_API_URL}`);


async function triggerMainServiceImport() {
    try {
        console.log(`[SD_CARD_IMPORTER] Triggering main service import at ${EDITOR_API_URL}...`);
        const response = await fetch(EDITOR_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (response.ok) {
            console.log(`[SD_CARD_IMPORTER] Main service import triggered successfully.`);
        } else {
            const errorText = await response.text();
            console.error(`[SD_CARD_IMPORTER ERROR] Failed to trigger main service import: ${response.status} ${response.statusText} - ${errorText}`);
        }
    } catch (error) {
        console.error(`[SD_CARD_IMPORTER ERROR] Network error triggering main service import:`, error);
    }
}

async function processSdCard() {
    if (isProcessingSdCard || !SD_CARD_IMPORT_PATH) {
        return;
    }

    isProcessingSdCard = true;
    console.log(`[SD_CARD_IMPORTER] Checking SD card at ${SD_CARD_IMPORT_PATH}...`);

    let filesCopied = 0;

    try {
        const sdCardStat = await fs.stat(SD_CARD_IMPORT_PATH);
        if (!sdCardStat.isDirectory()) {
            console.log(`[SD_CARD_IMPORTER] SD_CARD_IMPORT_PATH is not a directory.`);
            isProcessingSdCard = false;
            return;
        }

        const dcimPath = path.join(SD_CARD_IMPORT_PATH, 'DCIM');
        try {
            const dcimStat = await fs.stat(dcimPath);
            if (!dcimStat.isDirectory()) {
                console.log(`[SD_CARD_IMPORTER] DCIM folder not found in ${SD_CARD_IMPORT_PATH}.`);
                isProcessingSdCard = false;
                return;
            }
        } catch (e: any) {
            if (e.code === 'ENOENT') {
                console.log(`[SD_CARD_IMPORTER] DCIM folder not found in ${SD_CARD_IMPORT_PATH}.`);
            } else {
                console.error(`[SD_CARD_IMPORTER ERROR] Error accessing DCIM folder:`, e);
            }
            isProcessingSdCard = false;
            return;
        }

        console.log(`[SD_CARD_IMPORTER] SD card detected. Scanning DCIM folder: ${dcimPath}`);

        const glob = new Glob('**/*');
        const matches = glob.scan({ cwd: dcimPath });
        const filesToProcess: { sdFilePath: string; size: number }[] = [];

        for await (const file of matches) {
            const fullPath = path.join(dcimPath, file);
            const extension = path.extname(file).toLowerCase();
            if (supportedExtensions.includes(extension)) {
                try {
                    const stats = await fs.stat(fullPath);
                    if (stats.isFile()) {
                        filesToProcess.push({ sdFilePath: fullPath, size: stats.size });
                    }
                } catch (statError) {
                    console.warn(`[SD_CARD_IMPORTER] Could not stat file ${fullPath}:`, statError);
                }
            }
        }

        console.log(`[SD_CARD_IMPORTER] Found ${filesToProcess.length} potential image files.`);

        for (const { sdFilePath, size } of filesToProcess) {
            const relativePathFromDcim = path.relative(dcimPath, sdFilePath);
            const uniqueFileId = `${relativePathFromDcim}_${size}bytes`; // Unique ID for persistent tracking

            if (processedSdCardFiles.has(uniqueFileId)) {
                continue;
            }

            const originalFileName = path.basename(sdFilePath);
            const originalExtension = path.extname(originalFileName);
            const originalBaseName = path.basename(originalFileName, originalExtension);
            const relativeDirPathFromDcim = path.dirname(relativePathFromDcim);

            // Create a unique suffix from the directory path, replacing slashes with underscores
            const uniqueSuffix = relativeDirPathFromDcim === '.' ? '' : `_${relativeDirPathFromDcim.replace(/\//g, '_')}`;

            const uniqueFileNameInImportDir = `${originalBaseName}${uniqueSuffix}${originalExtension}`;
            const destinationPath = path.join(IMPORT_DIR, uniqueFileNameInImportDir);

            try {
                console.log(`[SD_CARD_IMPORTER] Copying ${sdFilePath} to ${destinationPath}...`);
                await fs.copyFile(sdFilePath, destinationPath);
                console.log(`[SD_CARD_IMPORTER] Successfully copied ${uniqueFileNameInImportDir}.`);
                processedSdCardFiles.add(uniqueFileId);
                filesCopied++;
            } catch (copyError) {
                console.error(`[SD_CARD_IMPORTER ERROR] Failed to copy ${sdFilePath}:`, copyError);
            }
        }

        console.log(`[SD_CARD_IMPORTER] SD card processing complete.`);

        if (filesCopied > 0) {
            await triggerMainServiceImport();
        }

    } catch (error: any) {
        if (error.code === 'ENOENT') {
            // SD card not found, expected during polling
        } else {
            console.error(`[SD_CARD_IMPORTER ERROR] Error accessing SD card:`, error);
        }
    } finally {
        isProcessingSdCard = false;
    }
}

// Start polling for SD card after log is loaded
if (SD_CARD_IMPORT_PATH) {
    setInterval(processSdCard, POLLING_INTERVAL_MS);
    processSdCard(); // Run once immediately
}
