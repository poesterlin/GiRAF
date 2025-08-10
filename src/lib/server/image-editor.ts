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
export async function editImage(imagePath: string, pp3: string, allowConcurrent: boolean = false): Promise<string> {
    const start = performance.now();

    let name = getFileNameFromPath(imagePath);

    if (allowConcurrent) {
        name += `-${Date.now()}`;
    }

    const tempDir = await createTempDir(name);
    const output = join(tempDir, 'edited.jpg');

    // Write the pp3 file to the temp directory
    const pp3FilePath = join(tempDir, 'edit.pp3');
    await Bun.write(pp3FilePath, pp3);

    // Build rawtherapee-cli args according to the usage you pasted.
    // Use -p for profile, -o for output, -Y overwrite, and -c <input> last.
    const rawtherapeeBin = "/sbin/rawtherapee-cli";
    const command = [
        rawtherapeeBin,
        "--no-gui",
        "-p",
        pp3FilePath,
        "-o",
        output,
        "-Y",
        "-c",
        imagePath, // input must be last; rawtherapee will resolve it relative to cwd
    ];

    // Check if the image is already being processed
    const lastController = runningByImage.get(name);
    if (!allowConcurrent && lastController && !lastController.signal.aborted) {
        lastController.abort();
        console.log(`Aborted previous editing for image: ${name}`);
    }

    let signal = AbortSignal.timeout(5000);
    if (!allowConcurrent) {
        const controller = new AbortController();
        runningByImage.set(name, controller);
        signal = AbortSignal.any([controller.signal, signal]);
    }

    await runCommand(command, { signal });

    const end = performance.now();
    console.log(`Image edited in ${((end - start) / 1000).toFixed(2)} seconds`);
    return output;
}
