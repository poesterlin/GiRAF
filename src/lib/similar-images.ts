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

/** Nothing more than the widest tier apart can ever match, so a scan can stop there. */
const MAX_SIMILAR_GAP_MS = SIMILARITY_TIERS[SIMILARITY_TIERS.length - 1].maxGapMs;

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
 * How many positions either side of a shot are compared against it. Comparing a window rather than
 * only the immediate neighbour means one non-matching frame between two matching ones no longer
 * hides the group.
 *
 * A scan also stops once a shot is more than the widest similarity tier (30 s) away, so this is an
 * upper bound rather than a fixed cost: for ordinary shooting the time bound is reached first. It
 * only bites during a fast burst, where it caps how far back a single frame can reach.
 */
export const SIMILARITY_WINDOW = 32;

/**
 * The group of similar shots around an image, in session order. Every photo is compared with the
 * `window` shots either side of it and matches are chained, so a slowly changing burst stays
 * together even when a frame in the middle does not match its neighbours. `window = 1` reproduces
 * plain neighbour chaining. Archived photos are already decided and do not take part, unless the
 * caller wants to revisit them. Stored import stacks are ignored: they were built with looser rules
 * and miss photos hashed later.
 *
 * `images` must be in capture order, which is what lets the scan stop at the 30 s boundary.
 */
export function similarCandidates<T extends StackedImage>(images: T[], image: StackedImage, includeArchived = false, window = SIMILARITY_WINDOW): T[] {
	const active = includeArchived ? images : images.filter((candidate) => !candidate.isArchived);
	const index = active.findIndex((candidate) => candidate.id === image.id);
	if (index === -1) return [];

	// Lists arrive in capture order, so the scan can stop as soon as a shot is too old to match.
	const times = active.map((candidate) => (candidate.recordedAt ? new Date(candidate.recordedAt).getTime() : NaN));

	// Grow the group outward from the image until no photo inside the window matches a member.
	const matched = new Set<number>([index]);
	const queue = [index];
	while (queue.length) {
		const current = queue.pop()!;
		for (const direction of [-1, 1]) {
			for (let position = current + direction; position >= 0 && position < active.length; position += direction) {
				if (Math.abs(position - current) > window) break;
				if (Math.abs(times[position] - times[current]) > MAX_SIMILAR_GAP_MS) break;
				if (matched.has(position) || !areSimilar(active[current], active[position])) continue;
				matched.add(position);
				queue.push(position);
			}
		}
	}
	if (matched.size === 1) return [];
	return [...matched].sort((a, b) => a - b).map((position) => active[position]);
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
