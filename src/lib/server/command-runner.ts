import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { env } from '$env/dynamic/private';

export async function createTempDir(prefix: string) {
	const TMP_DIR = env.TMP_DIR || tmpdir();
	const path = join(TMP_DIR, `${prefix}`);

	try {
		await mkdir(path, { recursive: true });
	} catch {
		/* ignore */
	}

	return path;
}

/**
 * Runs a command to completion. `background` lowers its CPU priority so editor previews
 * stay responsive while imports, exports and thumbnails render.
 */
export async function runCommand(command: string[], options: { signal?: AbortSignal; background?: boolean } = {}) {
	return new Promise<void>((resolve, reject) => {
		// nice execs the command in place, so aborting still kills the renderer itself.
		const prefixed = options.background ? ['nice', '-n', '19', ...command] : command;
		const args = prefixed.slice(1);
		const commandName = prefixed[0];
		const proc = spawn(commandName, args, { signal: options.signal });
		let output = '';
		let errorOutput = '';

		proc.stdout.on('data', (data) => {
			output += data.toString();
		});

		proc.stderr.on('data', (data) => {
			errorOutput += data.toString();
		});

		proc.on('error', (error) => {
			if (errorOutput) {
				console.error(`Command error output: ${errorOutput}`);
			}
			reject(error);
		});

		proc.on('exit', (code) => {
			if (code !== 0) {
				reject(`\nCommand: ${command.join(' ')} \noutput: \n${output} \nerror: \n${errorOutput} \nexit code: ${code}`);
			} else {
				if (output) {
					console.log(`Command output: \n${output}`);
				}
				resolve();
			}
		});
	});
}
