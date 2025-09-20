import { basename, extname, join } from "node:path";
import { createTempDir, runCommand } from "./command-runner";
import { getFileNameFromPath } from "./utils";
import { parsePP3, type PP3 } from "$lib/pp3-utils";
import { tmpdir } from "os";
import { mkdtemp, readdir, readFile } from "node:fs/promises";
import ImportPP3 from '$lib/assets/import.pp3?raw';

/**
 * uses rawtherapee's pp3 file to edit an image
 * 
 * @param imagePath 
 * @param pp3 
 * @param options 
 * @returns 
*/
export async function editImage(imagePath: string, pp3: string, options: { allowConcurrent?: boolean, signal?: AbortSignal, outputPath?: string, recordedAt?: Date } = {}): Promise<string> {
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
        "-j65", // JPEG quality TODO: make configurable
        "-js1", // JPEG subsampling TODO: make configurable
        "-Y",
        "-c",
        imagePath, // input must be last; rawtherapee will resolve it relative to cwd
    ];

    console.log(`Running command: ${command.join(" ")}`);

    await runCommand(command, { signal: options.signal });


    if (options.recordedAt) {
        const recordedAt = options.recordedAt.toISOString().slice(0, 19).replace('T', ' ');
        const exifCommand = [
            'exiftool',
            `-DateTimeOriginal=${recordedAt}`,
            '-overwrite_original',
            imagePath
        ];
        console.log(`Running command: ${exifCommand.join(" ")}`);
        await runCommand(exifCommand, { signal: options.signal });
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


export function setWhiteBalance(pp3: PP3, temperature: number | null, green: number | null): PP3 {
	if (temperature === null || green === null) {
		return pp3;
	}

	if (pp3.White_Balance.Setting !== 'Custom') {
		return pp3;
	}

	const whiteBalanceMatches = pp3.White_Balance?.Temperature === temperature && pp3.White_Balance?.Green === green;
	const tintMatches = pp3.White_Balance?.Green === green;

	if (whiteBalanceMatches && tintMatches) {
		pp3.White_Balance.Setting = 'Camera';
	}

	return pp3;
}