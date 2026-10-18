import ImportPP3 from '$lib/assets/import.pp3?raw';
import { parsePP3, stringifyPP3, type PP3 } from '$lib/pp3-utils';
import { exiftool } from 'exiftool-vendored';
import { mkdir, readFile, rm } from 'node:fs/promises';
import { basename, dirname, extname, join } from 'node:path';
import { createTempDir, runCommand } from './command-runner';
import { getFileNameFromPath } from './utils';
import { mapSpotRemovalToTarget } from '$lib/spot-removal';
import { randomUUID } from 'node:crypto';

/**
 * Renders `imagePath` with a PP3 profile. Without `outputPath` the JPEG lands in a fresh temp
 * directory, and the caller must remove `dirname(output)` once it has read the file.
 */
export async function editImage(
	imagePath: string,
	pp3: string,
	options: { signal?: AbortSignal; outputPath?: string; recordedAt?: Date; quality?: number; background?: boolean } = {}
): Promise<string> {
	const start = performance.now();

	// Each render owns its profile and output, including simultaneous LUT previews.
	const name = `${getFileNameFromPath(imagePath)}-${randomUUID()}`;

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
		'--no-gui',
		'-p',
		pp3FilePath,
		'-q',
		'-o',
		output,
		`-j${options.quality ?? 65}`, // JPEG quality
		'-js1', // JPEG subsampling TODO: make configurable
		'-Y',
		'-c',
		imagePath // input must be last; rawtherapee will resolve it relative to cwd
	];

	console.log(`Running command: ${command.join(' ')}`);

	try {
		await runCommand(command, { signal: options.signal, background: options.background });
	} catch (error) {
		await rm(tempDir, { recursive: true, force: true });
		throw error;
	} finally {
		// With an outputPath the temp dir only held the profile; without one the caller removes it with the JPEG
		if (options.outputPath) await rm(tempDir, { recursive: true, force: true });
	}

	if (options.recordedAt) {
		try {
			const recordedAt = options.recordedAt.toISOString().slice(0, 19).replace('T', ' ');
			const exifCommand = [
				'exiftool',
				`-DateTimeOriginal=${recordedAt}`,
				'-overwrite_original',
				// Stamp the rendered output, not the input: the input may be a shared, cached
				// develop base that must stay immutable for concurrent renders.
				output
			];
			console.log(`Running command: ${exifCommand.join(' ')}`);
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
export async function generateImportTif(imagePath: string, options: { signal?: AbortSignal; background?: boolean } = {}) {
	const start = performance.now();

	// Cards reuse file names (DSC00001.ARW); a shared folder would let one import overwrite another's TIFF
	const name = getFileNameFromPath(imagePath) + '-tiff-' + randomUUID();
	const outDir = await createTempDir(name);

	const pp3FilePath = join(outDir, 'edit.pp3');
	await Bun.write(pp3FilePath, ImportPP3);

	// Build rawtherapee-cli args according to the usage you pasted.
	// Use -p for profile, -o for output, -Y overwrite, and -c <input> last.
	const command = ['rawtherapee-cli', '--no-gui', '-p', pp3FilePath, '-b16', '-t', '-O', outDir, '-Y', '-c', imagePath];

	console.log(`Running command: ${command.join(' ')}`);

	await runCommand(command, { signal: options.signal, background: options.background });

	const outputName = basename(imagePath, extname(imagePath)) + '.tif';
	const pp3FileName = outputName + '.pp3';
	const pp3File = join(outDir, pp3FileName);

	const pp3Text = await readFile(pp3File, 'utf8');

	const end = performance.now();
	console.log(`Get default PP3 for ${imagePath} in ${((end - start) / 1000).toFixed(2)} seconds`);

	return { pp3: parsePP3(pp3Text), tif: join(outDir, outputName) };
}

/**
 * The import profile a photo's editor TIFF was developed with, saved beside it as edit.pp3.
 * Develop bases reuse it so full-size previews and exports keep the geometry the photo was edited
 * on, even after import.pp3 changes (photos imported before lens correction stay uncorrected).
 */
export async function importProfileFor(tifPath: string | null | undefined): Promise<string> {
	if (!tifPath) return ImportPP3;
	return readFile(join(dirname(tifPath), 'edit.pp3'), 'utf8').catch(() => ImportPP3);
}

/**
 * Generates a full-resolution TIFF from RAW using the same import.pp3 but with Resize disabled.
 * This ensures the same auto-exposure and WB are baked in as the preview TIFF, just at full resolution.
 *
 * The resulting TIFF is the "develop base" intermediate representation: RawTherapee can load it
 * back through StdImageSource, skipping RAW decode and demosaicing on every later render. Pass
 * outputDir to build the base at a stable location (e.g. a cache) instead of a throwaway temp dir.
 * longEdge shrinks the base, so previews that never need full resolution render far less.
 */
export async function generateExportTif(imagePath: string, options: { signal?: AbortSignal; outputDir?: string; profile?: string; longEdge?: number; background?: boolean } = {}) {
	const start = performance.now();

	const name = getFileNameFromPath(imagePath) + '-export-tiff-' + randomUUID();
	const outDir = options.outputDir ?? (await createTempDir(name));
	if (options.outputDir) await mkdir(outDir, { recursive: true });

	// Parse import PP3 and resize to the requested long edge, or disable resize for full resolution
	const importPP3 = parsePP3(options.profile ?? ImportPP3);
	importPP3.Resize = options.longEdge
		? {
				Enabled: true,
				AppliesTo: 'Cropped area',
				Method: 'Lanczos',
				DataSpecified: 3,
				Width: options.longEdge,
				Height: options.longEdge,
				LongEdge: options.longEdge,
				ShortEdge: options.longEdge,
				AllowUpscaling: false
			}
		: { ...importPP3.Resize, Enabled: false };

	const pp3FilePath = join(outDir, 'edit.pp3');
	await Bun.write(pp3FilePath, stringifyPP3(importPP3));

	const command = ['rawtherapee-cli', '--no-gui', '-p', pp3FilePath, '-b16', '-t', '-O', outDir, '-Y', '-c', imagePath];

	console.log(`Running command: ${command.join(' ')}`);

	try {
		await runCommand(command, { signal: options.signal, background: options.background });
	} catch (error) {
		await rm(outDir, { recursive: true, force: true });
		throw error;
	}

	const outputName = basename(imagePath, extname(imagePath)) + '.tif';
	const end = performance.now();
	console.log(`Generated export TIF for ${imagePath} in ${((end - start) / 1000).toFixed(2)} seconds`);

	return join(outDir, outputName);
}

export async function getImageDimensions(path: string): Promise<{ width: number; height: number } | null> {
	try {
		const tags = await exiftool.read(path);
		const width = Number(tags.ImageWidth ?? tags.ExifImageWidth);
		const height = Number(tags.ImageHeight ?? tags.ExifImageHeight);
		if (!Number.isFinite(width) || !Number.isFinite(height)) {
			return null;
		}
		return { width, height };
	} catch {
		return null;
	}
}

function mapCropToTarget(pp3: PP3, sourceWidth: number, sourceHeight: number, targetWidth: number, targetHeight: number): PP3 {
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

/** Map preview-TIFF pixel settings (crop and spot removal) to the export TIFF. */
export async function mapCropFromPreviewToExport(pp3: PP3, previewPath: string | null | undefined, exportPath: string | null | undefined): Promise<PP3> {
	if ((!pp3.Crop && !pp3.Spot_removal) || !previewPath || !exportPath) {
		return pp3;
	}

	const start = performance.now();
	const [previewDims, exportDims] = await Promise.all([getImageDimensions(previewPath), getImageDimensions(exportPath)]);
	const duration = performance.now() - start;
	console.log(`[CropMap] Dimension lookup took ${duration.toFixed(2)}ms`);

	if (!previewDims || !exportDims) {
		return pp3;
	}

	const mapped = mapSpotRemovalToTarget(pp3, previewDims.width, previewDims.height, exportDims.width, exportDims.height);
	return mapCropToTarget(mapped, previewDims.width, previewDims.height, exportDims.width, exportDims.height);
}
