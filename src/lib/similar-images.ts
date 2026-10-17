import type { Image } from '$lib/server/db/schema';

/** What triage needs about each photo of the session; keeps the page payload small. */
export type TriageImage = Pick<Image, 'id' | 'isArchived' | 'version' | 'recordedAt' | 'phash' | 'name' | 'exposure' | 'aperture' | 'iso'>;

/**
 * Shots of one scene come back to back, so the allowed difference shrinks as the
 * gap grows: a burst frame may move a lot, a shot half a minute later must match closely.
 */
const SIMILARITY_TIERS = [
	{ maxGapMs: 3_000, maxDistance: 100 },
	{ maxGapMs: 30_000, maxDistance: 30 }
];

export interface StackedImage {
	id: number;
	isArchived: boolean;
	phash?: string | null;
	recordedAt?: Date | string;
}

export function hammingDistance(hex1: string, hex2: string): number {
	if (hex1.length !== hex2.length) throw new Error('Strings must have the same length');
	let distance = 0;
	for (let i = 0; i < hex1.length; i++) {
		let xor = parseInt(hex1[i], 16) ^ parseInt(hex2[i], 16);
		while (xor > 0) {
			distance += xor & 1;
			xor >>= 1;
		}
	}
	return distance;
}

export function areSimilar(a: StackedImage, b: StackedImage): boolean {
	if (!a.phash || !b.phash || a.phash.length !== b.phash.length || !a.recordedAt || !b.recordedAt) return false;
	const gap = Math.abs(new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime());
	const tier = SIMILARITY_TIERS.find((candidate) => gap <= candidate.maxGapMs);
	return !!tier && hammingDistance(a.phash, b.phash) <= tier.maxDistance;
}

/**
 * The run of back-to-back similar shots around an image, in session order.
 * Neighbours chain, so a slowly changing burst stays together. Archived photos
 * are already decided and do not take part, unless the caller wants to revisit them. Stored import stacks are ignored:
 * they were built with looser rules and miss photos hashed later.
 */
export function similarCandidates<T extends StackedImage>(images: T[], image: StackedImage, includeArchived = false): T[] {
	const active = includeArchived ? images : images.filter((candidate) => !candidate.isArchived);
	const index = active.findIndex((candidate) => candidate.id === image.id);
	if (index === -1) return [];
	let start = index;
	while (start > 0 && areSimilar(active[start - 1], active[start])) start--;
	let end = index;
	while (end < active.length - 1 && areSimilar(active[end], active[end + 1])) end++;
	return end > start ? active.slice(start, end + 1) : [];
}

/** The photo to continue with after a stack was dealt with: the first one past its last member. */
export function nextAfterStack<T extends { id: number }>(images: T[], members: { id: number }[]): number | undefined {
	const ids = new Set(members.map((member) => member.id));
	let last = -1;
	images.forEach((image, index) => {
		if (ids.has(image.id)) last = index;
	});
	return last === -1 ? undefined : images[last + 1]?.id;
}

const REVIEWED_KEY = 'giraf:similar-reviewed';

/** Stacks the user answered once; kept across visits so a decided stack is not asked about again. */
export function reviewedStacks(storage: Pick<Storage, 'getItem'> | undefined): Set<number> {
	try {
		const parsed = JSON.parse(storage?.getItem(REVIEWED_KEY) ?? '[]');
		return new Set(Array.isArray(parsed) ? parsed.filter((id): id is number => Number.isInteger(id)) : []);
	} catch {
		return new Set();
	}
}

export function markStackReviewed(storage: Pick<Storage, 'getItem' | 'setItem'> | undefined, base: number) {
	try {
		const reviewed = reviewedStacks(storage);
		reviewed.add(base);
		storage?.setItem(REVIEWED_KEY, JSON.stringify([...reviewed].slice(-2000)));
	} catch {
		// Storage can be unavailable; the prompt then simply returns next visit.
	}
}
