import type { Image } from './db/schema';

/** The kinds of work an export picks up for a photo that is not up to date. */
export type ChangeKind = 'added' | 'edited' | 'missing';

type ExportState = Pick<Image, 'lastExportedAt' | 'updatedAt'>;

/**
 * The export executor's rule for re-rendering a photo: never exported, changed
 * since its last export, or missing from the export folder.
 */
export function needsExport(image: ExportState, fileExists: boolean): boolean {
	return !image.lastExportedAt || image.lastExportedAt < image.updatedAt || !fileExists;
}

/** What a pending photo contributes to a session's change log, or null when it is up to date. */
export function changeKind(image: ExportState, fileExists: boolean): ChangeKind | null {
	if (!needsExport(image, fileExists)) return null;
	if (!image.lastExportedAt) return 'added';
	if (image.lastExportedAt < image.updatedAt) return 'edited';
	return 'missing';
}
