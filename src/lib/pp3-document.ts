import { parsePP3, stringifyPP3, type PP3 } from './pp3-utils';

/** UI-only state. The ordinary PP3 settings remain the effective render settings. */
export interface PP3UiMetadata {
	disabledGroups: string[];
	savedValues: PP3;
}

export interface PP3Document {
	settings: PP3;
	ui?: PP3UiMetadata;
	/** Ordinary comments, retained when serializing (normalized to the header). */
	comments: string[];
}

const VERSION_PREFIX = '# GiRAF-UI-Version:';
const METADATA_PREFIX = '# GiRAF-UI:';

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validateMetadata(value: unknown): asserts value is PP3UiMetadata {
	if (!isRecord(value) || !Array.isArray(value.disabledGroups) ||
		value.disabledGroups.some((group) => typeof group !== 'string' || !group.trim()) ||
		new Set(value.disabledGroups).size !== value.disabledGroups.length || !isRecord(value.savedValues)) {
		throw new Error('Invalid GiRAF UI metadata');
	}
	for (const section of Object.values(value.savedValues)) {
		if (!isRecord(section) || Object.values(section).some((setting) =>
			!(typeof setting === 'string' || typeof setting === 'boolean' ||
				(typeof setting === 'number' && Number.isFinite(setting))))) {
			throw new Error('Invalid GiRAF saved settings');
		}
	}
}

/** Invalid/unsupported metadata is explicit, rather than silently losing disabled edits. */
export function parsePP3Document(source: string): PP3Document {
	const comments: string[] = [];
	let version: string | undefined;
	let payload: string | undefined;
	for (const line of source.replace(/^\uFEFF/, '').split(/\r?\n/)) {
		const trimmed = line.trim();
		if (trimmed.startsWith(VERSION_PREFIX)) {
			if (version !== undefined) throw new Error('Duplicate GiRAF UI version');
			version = trimmed.slice(VERSION_PREFIX.length).trim();
		} else if (trimmed.startsWith(METADATA_PREFIX)) {
			if (payload !== undefined) throw new Error('Duplicate GiRAF UI metadata');
			payload = trimmed.slice(METADATA_PREFIX.length).trim();
		} else if (trimmed.startsWith('#')) comments.push(trimmed);
	}
	const document: PP3Document = { settings: parsePP3(source), comments };
	if (version === undefined && payload === undefined) return document;
	if (version === undefined || payload === undefined) throw new Error('Incomplete GiRAF UI metadata');
	if (version !== '1') throw new Error(`Unsupported GiRAF UI version: ${version}`);
	let ui: unknown;
	try { ui = JSON.parse(payload); } catch { throw new Error('Invalid GiRAF UI JSON'); }
	validateMetadata(ui);
	document.ui = ui;
	return document;
}

export function stringifyPP3Document(document: PP3Document): string {
	const header: string[] = [];
	for (const comment of document.comments) {
		const trimmed = comment.trim();
		if (!trimmed.startsWith('#') || /[\r\n]/.test(trimmed) ||
			trimmed.startsWith(VERSION_PREFIX) || trimmed.startsWith(METADATA_PREFIX)) {
			throw new Error('Invalid ordinary PP3 comment');
		}
		header.push(trimmed);
	}
	if (document.ui !== undefined) {
		validateMetadata(document.ui);
		header.push(`${VERSION_PREFIX} 1`, `${METADATA_PREFIX} ${JSON.stringify(document.ui)}`);
	}
	const settings = stringifyPP3(document.settings);
	return [header.join('\n'), settings].filter(Boolean).join('\n\n');
}
