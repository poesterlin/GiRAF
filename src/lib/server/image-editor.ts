import { basename, extname, join } from "node:path";
import { createTempDir, runCommand } from "./command-runner";
import { getFileNameFromPath } from "./utils";
import { parsePP3, stringifyPP3, type PP3 } from "$lib/pp3-utils";
import { tmpdir } from "os";
import { mkdtemp, readdir, readFile } from "node:fs/promises";
import ImportPP3 from '$lib/assets/import.pp3?raw';
import { exiftool } from "exiftool-vendored";

/**
 * uses rawtherapee's pp3 file to edit an image
 * 
 * @param imagePath 
 * @param pp3 
 * @param options 
 * @returns 
*/
export async function editImage(imagePath: string, pp3: string, options: { allowConcurrent?: boolean, signal?: AbortSignal, outputPath?: string, recordedAt?: Date, quality?: number } = {}): Promise<string> {
    const start = performance.now();

    let name = getFileNameFromPath(imagePath);

    if (options.allowConcurrent) {
        name += `-${Date.now()}`;
    }

    const tempDir = await createTempDir(name);

    const output = options.outputPath ?? join(tempDir, 'edited.jpg');

    // Write the pp3 file to the temp directory
    const pp3FilePath = join(tempDir, 'edit.pp3');
    await Bun.write(pp3FilePath, pp3);

    console.log(`Editing image: ${pp3FilePath}, output: ${output}`);

    // Build rawtherapee-cli args according to the usage you pasted.
    // Use -p for profile, -o for output, -Y overwrite, and -c <input> last.
    const command = [
        'rawtherapee-cli',
        "--no-gui",
        "-p",
        pp3FilePath,
        "-q",
        "-o",
        output,
        `-j${options.quality ?? 65}`, // JPEG quality
        "-js1", // JPEG subsampling TODO: make configurable
        "-Y",
        "-c",
        imagePath, // input must be last; rawtherapee will resolve it relative to cwd
    ];

    console.log(`Running command: ${command.join(" ")}`);

    await runCommand(command, { signal: options.signal });


    if (options.recordedAt) {
        try {

            const recordedAt = options.recordedAt.toISOString().slice(0, 19).replace('T', ' ');
            const exifCommand = [
                'exiftool',
                `-DateTimeOriginal=${recordedAt}`,
                '-overwrite_original',
                imagePath
            ];
            console.log(`Running command: ${exifCommand.join(" ")}`);
            await runCommand(exifCommand, { signal: options.signal });
        } catch (error) {
            console.error('Failed to set DateTimeOriginal EXIF tag:', error);
        }
    }

    const end = performance.now();
    console.log(`Image edited in ${((end - start) / 1000).toFixed(2)} seconds`);
    return output;
}

/**
 * takes a path to a raw file to retrieve its default PP3 settings
 */
export async function generateImportTif(imagePath: string, options: { signal?: AbortSignal } = {}) {
    const start = performance.now();

    const name = getFileNameFromPath(imagePath) + '-tiff';
    const outDir = await createTempDir(name);

    const pp3FilePath = join(outDir, 'edit.pp3');
    await Bun.write(pp3FilePath, ImportPP3);

    // Build rawtherapee-cli args according to the usage you pasted.
    // Use -p for profile, -o for output, -Y overwrite, and -c <input> last.
    const command = [
        'rawtherapee-cli',
        "--no-gui",
        "-p", pp3FilePath,
        "-b16", "-t",
        "-O", outDir,
        "-Y",
        "-c", imagePath
    ];

    console.log(`Running command: ${command.join(" ")}`);

    await runCommand(command, { signal: options.signal });

    const outputName = basename(imagePath, extname(imagePath)) + ".tif";
    const pp3FileName = outputName + ".pp3";
    const pp3File = join(outDir, pp3FileName);

    const pp3Text = await readFile(pp3File, "utf8");

    const end = performance.now();
    console.log(`Get default PP3 for ${imagePath} in ${((end - start) / 1000).toFixed(2)} seconds`);

    return { pp3: parsePP3(pp3Text), tif: join(outDir, outputName) };
}


/**
 * Generates a full-resolution TIFF from RAW using the same import.pp3 but with Resize disabled.
 * This ensures the same auto-exposure and WB are baked in as the preview TIFF, just at full resolution.
 */
export async function generateExportTif(imagePath: string, options: { signal?: AbortSignal } = {}) {
    const start = performance.now();

    const name = getFileNameFromPath(imagePath) + '-export-tiff';
    const outDir = await createTempDir(name);

    // Parse import PP3 and disable resize for full-resolution output
    const importPP3 = parsePP3(ImportPP3);
    importPP3.Resize = { ...importPP3.Resize, Enabled: false };

    const pp3FilePath = join(outDir, 'edit.pp3');
    await Bun.write(pp3FilePath, stringifyPP3(importPP3));

    const command = [
        'rawtherapee-cli',
        "--no-gui",
        "-p", pp3FilePath,
        "-b16", "-t",
        "-O", outDir,
        "-Y",
        "-c", imagePath
    ];

    console.log(`Running command: ${command.join(" ")}`);

    await runCommand(command, { signal: options.signal });

    const outputName = basename(imagePath, extname(imagePath)) + ".tif";
    const end = performance.now();
    console.log(`Generated export TIF for ${imagePath} in ${((end - start) / 1000).toFixed(2)} seconds`);

    return join(outDir, outputName);
}

async function getImageDimensions(path: string): Promise<{ width: number; height: number } | null> {
    try {
        const tags = await exiftool.read(path);
        const width = Number((tags as any).ImageWidth ?? (tags as any).ExifImageWidth);
        const height = Number((tags as any).ImageHeight ?? (tags as any).ExifImageHeight);
        if (!Number.isFinite(width) || !Number.isFinite(height)) {
            return null;
        }
        return { width, height };
    } catch {
        return null;
    }
}

export function mapCropToTarget(pp3: PP3, sourceWidth: number, sourceHeight: number, targetWidth: number, targetHeight: number): PP3 {
    if (!pp3.Crop) {
        return pp3;
    }

    if (!sourceWidth || !sourceHeight || !targetWidth || !targetHeight) {
        return pp3;
    }

    if (sourceWidth === targetWidth && sourceHeight === targetHeight) {
        return pp3;
    }

    const scaleX = targetWidth / sourceWidth;
    const scaleY = targetHeight / sourceHeight;

    if (!Number.isFinite(scaleX) || !Number.isFinite(scaleY) || scaleX <= 0 || scaleY <= 0) {
        return pp3;
    }

    const crop = pp3.Crop as unknown as Record<string, number>;

    const x = Number(crop.X ?? 0);
    const y = Number(crop.Y ?? 0);
    const w = Number(crop.W ?? 0);
    const h = Number(crop.H ?? 0);

    // If crop values already exceed preview bounds, assume they're in full-res space.
    if (x > sourceWidth || y > sourceHeight || w > sourceWidth || h > sourceHeight || x + w > sourceWidth + 1 || y + h > sourceHeight + 1) {
        return pp3;
    }

    crop.X = Math.round((crop.X ?? 0) * scaleX);
    crop.Y = Math.round((crop.Y ?? 0) * scaleY);
    crop.W = Math.round((crop.W ?? 0) * scaleX);
    crop.H = Math.round((crop.H ?? 0) * scaleY);

    return pp3;
}

export async function mapCropFromPreviewToExport(pp3: PP3, previewPath: string | null | undefined, exportPath: string | null | undefined): Promise<PP3> {
    if (!pp3.Crop || !previewPath || !exportPath) {
        return pp3;
    }

    const start = performance.now();
    const [previewDims, exportDims] = await Promise.all([
        getImageDimensions(previewPath),
        getImageDimensions(exportPath)
    ]);
    const duration = performance.now() - start;
    console.log(`[CropMap] Dimension lookup took ${duration.toFixed(2)}ms`);

    if (!previewDims || !exportDims) {
        return pp3;
    }

    return mapCropToTarget(pp3, previewDims.width, previewDims.height, exportDims.width, exportDims.height);
}

export function setWhiteBalance(pp3: PP3, temperature: number | null, green: number | null): PP3 {
    if (temperature === null || green === null) {
        return pp3;
    }

    if (pp3.White_Balance?.Setting !== 'Custom') {
        return pp3;
    }

    const whiteBalanceMatches = pp3.White_Balance?.Temperature === temperature && pp3.White_Balance?.Green === green;
    const tintMatches = pp3.White_Balance?.Green === green;

    if (whiteBalanceMatches && tintMatches) {
        pp3.White_Balance.Setting = 'Camera';
    }

    return pp3;
}
