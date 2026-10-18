import type { PP3 } from '$lib/pp3-utils';

/**
 * Autosave keeps editing hands free, so most saves update the latest snapshot
 * in place. A new version is only worth its own row when the edit history needs
 * an anchor: the first edit, work that has been open for a while, a version that
 * has already been exported, or structural changes that are expensive to
 * reproduce (geometry, looks, masks, retouch).
 */

/** A snapshot older than this stops being the target of in-place updates. */
export const SNAPSHOT_INTERVAL_MS = 10 * 60 * 1000;

/** Accumulated slider distance that separates two versions of one look. */
export const SNAPSHOT_DISTANCE = 2.5;

/** Chapters whose chapters describe geometry, looks or localised work. */
const structuralChapters = ['Crop', 'Rotation', 'Coarse_Transformation', 'Perspective', 'Resizing', 'Film_Simulation', 'Black_&_White', 'Spot_removal', 'Locallab'] as const;

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

/** Chapters from the structural list that the two documents disagree on. */
export function changedStructuralChapters(base: PP3, target: PP3): string[] {
	const structural = new Set<string>(structuralChapters);
	return [
		...new Set(
			changedPP3Fields(base, target)
				.map((field) => field.chapter)
				.filter((chapter) => structural.has(chapter))
		)
	];
}

function fieldDistance(field: ChangedField): number {
	const { key, previous, next } = field;
	if (key === 'Enabled') return previous === next ? 0 : 0.25;
	if (typeof previous === 'number' && typeof next === 'number') {
		const scale = fieldScales[key] ?? Math.max(1, Math.abs(previous), Math.abs(next));
		return Math.min(1, Math.abs(next - previous) / scale);
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
	for (const field of changedPP3Fields(base, target)) {
		if (structuralChapters.includes(field.chapter as (typeof structuralChapters)[number])) continue;
		distance += fieldDistance(field);
	}
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
	if (structural) return 'create';
	return distance >= SNAPSHOT_DISTANCE ? 'create' : 'update';
}
