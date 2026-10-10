import { createGroupedDocument } from './adjustment-groups';
import { setLut, toBase64, type PP3 } from './pp3-utils';

/** Selecting a look enables its group; previews must use that same effective state. */
export function lutPreviewSettings(settings: PP3, disabledGroups: string[], path: string): PP3 {
	const candidate = setLut(structuredClone(settings), path);
	return createGroupedDocument(candidate, disabledGroups.filter((group) => group !== 'look')).settings;
}

export function lutPreviewUrl(imageId: string, settings: PP3): string {
	return `/api/images/${encodeURIComponent(imageId)}/edit?preview&config=${encodeURIComponent(toBase64(settings))}`;
}
