import { delimiter } from 'path';

/**
 * Directories scanned for RAW files: IMPORT_DIR (where uploads land) first, then any
 * extra read locations listed in IMPORT_EXTRA_DIRS, separated like PATH entries.
 */
export function importDirectories(env: Record<string, string | undefined>): string[] {
	const extra = (env.IMPORT_EXTRA_DIRS ?? '').split(delimiter);
	return [...new Set([env.IMPORT_DIR, ...extra].map((dir) => dir?.trim()).filter((dir): dir is string => Boolean(dir)))];
}
