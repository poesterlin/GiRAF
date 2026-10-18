import { expect, test } from 'bun:test';
import { autoScrollSpeed, dragSelection } from './drag-select';

const items = [0, 1, 2, 3, 4, 5];

test('dragging selects the range from the start photo to the current one', () => {
	expect([...dragSelection(new Set<number>(), items, 1, 3, true)].sort()).toEqual([1, 2, 3]);
	expect([...dragSelection(new Set<number>(), items, 3, 1, true)].sort()).toEqual([1, 2, 3]);
});

test('dragging back shrinks the range but keeps the earlier selection', () => {
	const baseline = new Set([5]);
	const wide = dragSelection(baseline, items, 1, 4, true);
	expect([...wide].sort()).toEqual([1, 2, 3, 4, 5]);
	expect([...dragSelection(baseline, items, 1, 2, true)].sort()).toEqual([1, 2, 5]);
});

test('starting on a selected photo deselects the range', () => {
	expect([...dragSelection(new Set(items), items, 2, 4, false)].sort()).toEqual([0, 1, 5]);
});

test('unselectable photos are skipped', () => {
	expect([...dragSelection(new Set<number>(), items, 0, 3, true, (item) => item !== 2)].sort()).toEqual([0, 1, 3]);
});

test('auto-scroll speeds up towards the edges and stops in the middle', () => {
	expect(autoScrollSpeed(400, 0, 800)).toBe(0);
	expect(autoScrollSpeed(0, 0, 800)).toBe(-24);
	expect(autoScrollSpeed(760, 0, 800)).toBe(12);
	expect(autoScrollSpeed(900, 0, 800)).toBe(24);
});
