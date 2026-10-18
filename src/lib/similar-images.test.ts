import { describe, expect, test } from 'bun:test';
import { areSimilar, markStackReviewed, nextAfterStack, reviewedStacks, similarCandidates } from './similar-images';

/** A 256-bit hash differing from the all-zero hash in exactly `bits` places. */
const hash = (bits: number) =>
	'f'
		.repeat(Math.floor(bits / 4))
		.padStart(64, '0')
		.replace(/^0/, bits % 4 ? ((1 << (bits % 4)) - 1).toString(16) : '0');
const shot = (id: number, bits: number, seconds: number, isArchived = false) => ({ id, isArchived, phash: hash(bits), recordedAt: new Date(1_000_000 + seconds * 1000) });

describe('similarity rule', () => {
	test('hash helper hits the requested distance', () => {
		expect(areSimilar(shot(1, 0, 0), shot(2, 56, 0))).toBe(true);
		expect(areSimilar(shot(1, 0, 0), shot(2, 104, 0))).toBe(false);
	});

	test('back to back frames tolerate a big change, later shots must match closely', () => {
		expect(areSimilar(shot(1, 0, 0), shot(2, 96, 1))).toBe(true);
		expect(areSimilar(shot(1, 0, 0), shot(2, 116, 1))).toBe(false);
		expect(areSimilar(shot(1, 0, 0), shot(2, 50, 10))).toBe(false);
		expect(areSimilar(shot(1, 0, 0), shot(2, 28, 20))).toBe(true);
		expect(areSimilar(shot(1, 0, 0), shot(2, 28, 40))).toBe(false);
	});

	test('photos without a hash never match', () => {
		expect(areSimilar({ ...shot(1, 0, 0), phash: null }, shot(2, 0, 0))).toBe(false);
	});
});

describe('similar candidates', () => {
	const images = [shot(1, 0, 0), shot(2, 0, 100), shot(3, 20, 101), shot(4, 40, 102), shot(5, 0, 400)];

	test('chains neighbours into one run from any member', () => {
		expect(similarCandidates(images, images[1]).map((i) => i.id)).toEqual([2, 3, 4]);
		expect(similarCandidates(images, images[3]).map((i) => i.id)).toEqual([2, 3, 4]);
	});

	test('standalone photos have no candidates', () => {
		expect(similarCandidates(images, images[0])).toEqual([]);
		expect(similarCandidates(images, images[4])).toEqual([]);
	});

	test('a sorted group can be reopened with its archived shots', () => {
		const list = [shot(1, 0, 0), shot(2, 60, 1, true), shot(3, 0, 2)];
		expect(similarCandidates(list, list[1], true).map((i) => i.id)).toEqual([1, 2, 3]);
		expect(similarCandidates(list, list[0], true).map((i) => i.id)).toEqual([1, 2, 3]);
	});

	test('archived photos are skipped and do not break the chain', () => {
		const list = [shot(1, 0, 0), shot(2, 60, 1, true), shot(3, 0, 2)];
		expect(similarCandidates(list, list[0]).map((i) => i.id)).toEqual([1, 3]);
		expect(similarCandidates(list, list[1])).toEqual([]);
	});
});

describe('similar candidates across a window', () => {
	/** A 256-bit hash with exactly `bits` set, so distances between them are their difference. */
	const sparse = (bits: number[]) => {
		const nibbles = new Array(64).fill(0);
		for (const bit of bits) nibbles[Math.floor(bit / 4)] |= 1 << (bit % 4);
		return nibbles.map((nibble) => nibble.toString(16)).join('');
	};
	const range = (from: number, to: number) => Array.from({ length: to - from }, (_, i) => from + i);
	// A and B match at exactly the allowed 100 bits; C matches neither, so B is only reachable from A.
	const a = { id: 1, isArchived: false, phash: sparse([]), recordedAt: new Date(1_000_000) };
	const c = { id: 2, isArchived: false, phash: sparse(range(100, 210)), recordedAt: new Date(1_001_000) };
	const b = { id: 3, isArchived: false, phash: sparse(range(0, 100)), recordedAt: new Date(1_002_000) };

	test('a frame that matches neither neighbour no longer hides the group', () => {
		// Capture order puts the odd one in the middle, as a second-precision timestamp tie can.
		const images = [a, c, b];
		expect(areSimilar(a, b)).toBe(true);
		expect(areSimilar(a, c)).toBe(false);
		expect(areSimilar(c, b)).toBe(false);
		expect(similarCandidates(images, images[0]).map((i) => i.id)).toEqual([1, 3]);
		expect(similarCandidates(images, images[2]).map((i) => i.id)).toEqual([1, 3]);
		expect(similarCandidates(images, images[1])).toEqual([]);
	});

	test('window 1 keeps the old neighbour-only chaining', () => {
		const images = [a, c, b];
		expect(similarCandidates(images, images[0], false, 1)).toEqual([]);
	});

	test('a gap wider than the window is not bridged', () => {
		const images = [a, c, b];
		expect(similarCandidates(images, images[0], false, 1)).toEqual([]);
		expect(similarCandidates(images, images[0], false, 2).map((i) => i.id)).toEqual([1, 3]);
	});

	test('distant shots stay apart even with a wide window', () => {
		const near = { id: 1, isArchived: false, phash: sparse([]), recordedAt: new Date(1_000_000) };
		const far = { id: 2, isArchived: false, phash: sparse([]), recordedAt: new Date(1_000_000 + 60_000) };
		expect(similarCandidates([near, far], near, false, 50)).toEqual([]);
	});
});

describe('stack follow-up', () => {
	const images = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }];

	test('continues after the last member', () => {
		expect(nextAfterStack(images, [images[0], images[2]])).toBe(4);
		expect(nextAfterStack(images, [images[3]])).toBeUndefined();
	});

	test('remembers reviewed stacks', () => {
		const data = new Map<string, string>();
		const storage = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
		expect(reviewedStacks(storage).has(2)).toBe(false);
		markStackReviewed(storage, 2);
		expect(reviewedStacks(storage).has(2)).toBe(true);
		expect(reviewedStacks({ getItem: () => 'garbage' }).size).toBe(0);
	});
});
