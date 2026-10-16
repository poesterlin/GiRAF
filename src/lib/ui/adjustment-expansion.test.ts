import { expect, test } from 'bun:test';
import { farthestOpenGroupIndex } from './adjustment-expansion';

const group = (position: number, rank: number) => ({ position, rank });

test('closes the open group farthest from the newly opened one', () => {
	const open = [group(0, 1), group(2, 2), group(7, 3)];
	const victim = open[farthestOpenGroupIndex(11, open)];
	expect(victim).toBe(open[0]);
});

test('keeps the groups clustered around the newly opened one', () => {
	const open = [group(0, 1), group(1, 2), group(11, 3)];
	const victim = open[farthestOpenGroupIndex(1, open)];
	expect(victim).toBe(open[2]);
});

test('closes the least recently opened group when two are equally far', () => {
	const open = [group(4, 3), group(14, 1), group(6, 2)];
	const victim = open[farthestOpenGroupIndex(9, open)];
	expect(victim).toBe(open[1]);
});

test('reports -1 when no other group is open', () => {
	expect(farthestOpenGroupIndex(5, [])).toBe(-1);
});
