import { expect, mock, test } from 'bun:test';

mock.module('$env/dynamic/private', () => ({ env: {} }));

const { uploadLeftovers } = await import('./upload-sweep');

const HOUR = 60 * 60 * 1000;
const now = 1_000 * HOUR;
const resume = 48 * HOUR;

test('an unfinished upload is kept while it can still be resumed', () => {
	const folder = {
		mtimeMs: now - 50 * HOUR,
		files: [
			{ name: '0', mtimeMs: now - 50 * HOUR },
			{ name: '1', mtimeMs: now - 2 * HOUR }
		]
	};
	expect(uploadLeftovers(folder, now, resume)).toEqual([]);
});

test('an abandoned upload is removed after the resume window', () => {
	const folder = { mtimeMs: now - 49 * HOUR, files: [{ name: '0', mtimeMs: now - 49 * HOUR }] };
	expect(uploadLeftovers(folder, now, resume)).toBe('folder');
	expect(uploadLeftovers({ mtimeMs: now - 49 * HOUR, files: [] }, now, resume)).toBe('folder');
});

test('a finished upload keeps its receipt for 30 days', () => {
	expect(uploadLeftovers({ mtimeMs: now, files: [{ name: 'result.json', mtimeMs: now - 29 * 24 * HOUR }] }, now, resume)).toEqual([]);
	expect(uploadLeftovers({ mtimeMs: now, files: [{ name: 'result.json', mtimeMs: now - 31 * 24 * HOUR }] }, now, resume)).toBe('folder');
});

test('half-written chunks are removed once they are clearly abandoned', () => {
	const folder = {
		mtimeMs: now,
		files: [
			{ name: '3', mtimeMs: now },
			{ name: '4-abc.tmp', mtimeMs: now - 2 * HOUR },
			{ name: '5-def.tmp', mtimeMs: now - 1000 }
		]
	};
	expect(uploadLeftovers(folder, now, resume)).toEqual(['4-abc.tmp']);
});

test('by default an unfinished upload may be resumed for 4 hours', () => {
	const folder = (age: number) => ({ mtimeMs: now - age, files: [{ name: '0', mtimeMs: now - age }] });
	expect(uploadLeftovers(folder(3 * HOUR), now)).toEqual([]);
	expect(uploadLeftovers(folder(5 * HOUR), now)).toBe('folder');
});
