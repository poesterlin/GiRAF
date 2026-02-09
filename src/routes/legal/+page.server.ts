import type { PageServerLoad } from './$types';
import { readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const VERSION_PATH = '/opt/rawtherapee/metadata/VERSION';
const SOURCE_URL_PATH = '/opt/rawtherapee/metadata/SOURCE_URL';
const RAWTHERAPEE_BIN = '/opt/rawtherapee/usr/bin/rawtherapee-cli';
const APP_LICENSE_PATH = '/app/LICENSE';

const execFileAsync = promisify(execFile);

const safeRead = async (path: string) => {
	try {
		return (await readFile(path, 'utf8')).trim();
	} catch {
		return null;
	}
};

export const load: PageServerLoad = async () => {
	let [rawtherapeeVersion, rawtherapeeSourceUrl, appLicenseText] = await Promise.all([
		safeRead(VERSION_PATH),
		safeRead(SOURCE_URL_PATH),
		safeRead(APP_LICENSE_PATH)
	]);

	if (!rawtherapeeVersion) {
		try {
			const { stdout } = await execFileAsync(RAWTHERAPEE_BIN, ['--version']);
			const match = stdout.match(/\b(\d+\.\d+(\.\d+)?)\b/);
			rawtherapeeVersion = match?.[1] ?? null;
		} catch {
			// ignore
		}
	}

	if (!rawtherapeeSourceUrl && rawtherapeeVersion) {
		rawtherapeeSourceUrl = `https://github.com/RawTherapee/RawTherapee/tree/${rawtherapeeVersion}`;
	}

	return {
		rawtherapeeVersion,
		rawtherapeeSourceUrl,
		appLicenseText
	};
};
