import { join } from "node:path";
import { createTempDir, runCommand } from "./command-runner";
import { getFileNameFromPath } from "./utils";

const runningByImage = new Map<string, AbortController>();

/**
 * uses rawtherapee's pp3 file to edit an image
 * 
 * @param imagePath 
 * @param pp3 
 * @param options 
 * @returns 
*/
export async function editImage(imagePath: string, pp3: string, allowConcurrent: boolean = false, bitDepth = 8): Promise<string> {
    const start = performance.now();

    let name = getFileNameFromPath(imagePath);

    if (allowConcurrent) {
        name += `-${Date.now()}`;
    }

    const tempDir = await createTempDir(name);
    const output = join(tempDir, bitDepth === 8 ? 'edited.jpg' : `edited.tiff`);

    // Write the pp3 file to the temp directory
    const pp3FilePath = join(tempDir, 'edit.pp3');
    await Bun.write(pp3FilePath, pp3);

    console.log(`Editing image: ${pp3FilePath}, output: ${output}`);

    const tiffOptions = ["-b" + bitDepth, "-t"];
    const jpegOptions = ["-b" + bitDepth];

    // Build rawtherapee-cli args according to the usage you pasted.
    // Use -p for profile, -o for output, -Y overwrite, and -c <input> last.
    const command = [
        'rawtherapee-cli',
        "--no-gui",
        "-p",
        pp3FilePath,
        "-o",
        output,
        "-Y",
        ...(bitDepth === 8 ? jpegOptions : tiffOptions),
        "-c",
        imagePath, // input must be last; rawtherapee will resolve it relative to cwd
    ];

    console.log(`Running command: ${command.join(" ")}`);

    // Check if the image is already being processed
    // const lastController = runningByImage.get(name);
    // if (!allowConcurrent && lastController && !lastController.signal.aborted) {
    //     lastController.abort();
    //     console.log(`Aborted previous editing for image: ${name}`);
    // }

    // let signal = AbortSignal.timeout(5000);
    // if (!allowConcurrent) {
    //     const controller = new AbortController();
    //     runningByImage.set(name, controller);
    //     signal = AbortSignal.any([controller.signal, signal]);
    // }

    await runCommand(command, { signal: undefined });

    const end = performance.now();
    console.log(`Image edited in ${((end - start) / 1000).toFixed(2)} seconds`);
    return output;
}
