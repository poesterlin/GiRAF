import type { PP3 } from '$lib/pp3-utils';

/**
 * Autosave keeps editing hands free, so most saves update the latest snapshot
 * in place. A new version is only worth its own row when the edit history needs
 * an anchor: the first edit, work that has been open for a while, a version that
 * has already been exported, or structural changes that are expensive to
 * reproduce (geometry, switching a look, adding or removing a mask).
 *
 * Tuning inside that structure (a mask's sliders, a look's strength, another
 * retouch spot) is ordinary editing: it counts towards the slider distance, so
 * dragging a mask's exposure no longer writes a new version every few seconds.
 */

/** A snapshot older than this stops being the target of in-place updates. */
export const SNAPSHOT_INTERVAL_MS = 10 * 60 * 1000;

/**
 * Autosave never starts a new version before the latest one is this old, however much changed.
 * Trying looks, toggling tools on and off or dragging a slider far would otherwise leave a version
 * every few seconds. Saving explicitly still creates one at any time.
 */
export const MIN_SNAPSHOT_AGE_MS = 3 * 60 * 1000;

/** Accumulated slider distance that separates two versions of one look. */
export const SNAPSHOT_DISTANCE = 2.5;

/** Chapters that describe geometry: any change to them is structural. */
const geometryChapters = ['Crop', 'Rotation', 'Coarse_Transformation', 'Perspective', 'Resizing'];

const enabled = (chapter: PP3[string] | undefined) => chapter?.Enabled === true || chapter?.Enabled === 'true';

/**
 * The part of a look, mask or retouch chapter that makes up its structure. Two documents whose
 * identities match differ only in tuning.
 */
const chapterIdentity: Record<string, (chapter: PP3[string] | undefined) => string> = {
	Film_Simulation: (chapter) => `${enabled(chapter)}|${chapter?.ClutFilename ?? ''}`,
	'Black_&_White': (chapter) => `${enabled(chapter)}|${chapter?.Method ?? ''}`,
	Spot_removal: (chapter) => `${enabled(chapter)}`,
	Locallab: (chapter) =>
		`${enabled(chapter)}|${Object.keys(chapter ?? {})
			.filter((key) => /^Shape_\d+$/.test(key))
			.sort()
			.map((key) => `${key}=${chapter![key]}`)
			.join(',')}`
};

const structuralChapters = [...geometryChapters, ...Object.keys(chapterIdentity)];

function isIdentityField(chapter: string, key: string): boolean {
	if (geometryChapters.includes(chapter)) return true;
	if (!(chapter in chapterIdentity)) return false;
	return key === 'Enabled' || key === 'ClutFilename' || (chapter === 'Black_&_White' && key === 'Method') || /^Shape_\d+$/.test(key);
}

/**
 * Natural ranges of fields whose stored magnitudes say nothing about how much
 * the edit moved. Everything else is measured against its own value.
 */
const fieldScales: Record<string, number> = {
	Temperature: 500,
	Green: 10,
	Degree: 15,
	Feather: 50,
	Roundness: 50,
	Radius: 25,
	Amount: 50,
	HSV_Equalizer_HCurve: 100
};

type ChangedField = { chapter: string; key: string; previous: unknown; next: unknown };

/** Every field that differs, including fields and chapters that were removed. */
function changedPP3Fields(base: PP3, target: PP3): ChangedField[] {
	const changed: ChangedField[] = [];
	const chapters = new Set([...Object.keys(base ?? {}), ...Object.keys(target ?? {})]);
	for (const chapter of chapters) {
		const before = base?.[chapter] ?? {};
		const after = target?.[chapter] ?? {};
		for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
			const previous = before[key];
			const next = after[key];
			// Matches diffPP3, which compares loosely so '5' and 5 are one value.
			if ((previous as unknown) == (next as unknown)) continue;
			changed.push({ chapter, key, previous, next });
		}
	}
	return changed;
}

/** Structural chapters whose geometry or structure differs between the two documents. */
export function changedStructuralChapters(base: PP3, target: PP3): string[] {
	const changed = new Set(changedPP3Fields(base, target).map((field) => field.chapter));
	return structuralChapters.filter((chapter) => {
		if (!changed.has(chapter)) return false;
		const identity = chapterIdentity[chapter];
		return !identity || identity(base?.[chapter]) !== identity(target?.[chapter]);
	});
}

/** Fields such as `Red=1000;0;0;` or curve points: lists of numbers that move a little at a time. */
function numberList(value: unknown): number[] | null {
	if (typeof value !== 'string' || !value.includes(';')) return null;
	const parts = value.split(';').filter((part) => part.trim() !== '');
	const numbers = parts.map(Number);
	return numbers.length && numbers.every(Number.isFinite) ? numbers : null;
}

function fieldDistance(field: ChangedField): number {
	const { key, previous, next } = field;
	if (key === 'Enabled') return previous === next ? 0 : 0.25;
	if (typeof previous === 'number' && typeof next === 'number') {
		const scale = fieldScales[key] ?? Math.max(1, Math.abs(previous), Math.abs(next));
		return Math.min(1, Math.abs(next - previous) / scale);
	}
	const before = numberList(previous);
	const after = numberList(next);
	if (before && after && before.length === after.length) {
		const scale = fieldScales[key] ?? Math.max(1, ...before.map(Math.abs), ...after.map(Math.abs));
		return Math.min(1, Math.max(...before.map((value, index) => Math.abs(after[index] - value))) / scale);
	}
	// Curves, thresholds and file names move as a whole, so any difference in
	// them counts as a full step.
	return 1;
}

/**
 * How far the current edit sits from a saved version, in roughly "one slider
 * moved across a meaningful part of its range" units. Each field contributes at
 * most one unit, so no single value can dominate the total.
 */
export function pp3EditDistance(base: PP3, target: PP3): number {
	let distance = 0;
	// A mask or look has dozens of fields, so tuning one counts as at most one step
	const tuning = new Map<string, number>();
	for (const field of changedPP3Fields(base, target)) {
		if (isIdentityField(field.chapter, field.key)) continue;
		if (structuralChapters.includes(field.chapter)) tuning.set(field.chapter, (tuning.get(field.chapter) ?? 0) + fieldDistance(field));
		else distance += fieldDistance(field);
	}
	for (const amount of tuning.values()) distance += Math.min(1, amount);
	return distance;
}

export type SnapshotDecisionInput = {
	/** The image has no saved version yet. */
	hasSnapshot: boolean;
	/** Age of the latest snapshot in milliseconds. */
	ageMs: number;
	/** The latest snapshot is already part of an export. */
	exported: boolean;
	/** Chapters from the structural list changed. */
	structural: boolean;
	/** Accumulated slider distance from the latest snapshot. */
	distance: number;
};

export function snapshotDecision({ hasSnapshot, ageMs, exported, structural, distance }: SnapshotDecisionInput): 'create' | 'update' {
	if (!hasSnapshot || exported) return 'create';
	if (!Number.isFinite(ageMs) || ageMs >= SNAPSHOT_INTERVAL_MS) return 'create';
	if (ageMs < MIN_SNAPSHOT_AGE_MS) return 'update';
	if (structural) return 'create';
	return distance >= SNAPSHOT_DISTANCE ? 'create' : 'update';
}
