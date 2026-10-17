import { expect, mock, test } from 'bun:test';

// The module under test pulls in the database and SvelteKit's private env; neither is exercised by
// the path guard, so both are stubbed before it is imported.
mock.module('$env/dynamic/private', () => ({ env: {} }));
mock.module('./db', () => ({ db: {} }));

const { withinDirectory } = await import('./session-delete');

test('only paths inside their own store may be removed', () => {
	expect(withinDirectory('/app/tmp', '/app/tmp/thumbnails/12_preview.jpg')).toBe(true);
	expect(withinDirectory('/app/tmp', '/app/tmp')).toBe(true);
	expect(withinDirectory('/app/tmp/', '/app/tmp/DSCF0001.RAF-tiff/DSCF0001.tif')).toBe(true);
});

test('paths outside the store or that merely share a prefix are refused', () => {
	// Stale rows point at removed scratch locations; deleting those would reach outside the store.
	expect(withinDirectory('/app/tmp', '/tmp/1513_preview.jpg')).toBe(false);
	expect(withinDirectory('/app/import', '/app/import-backup/DSCF0001.RAF')).toBe(false);
	expect(withinDirectory('/app/import', '/etc/passwd')).toBe(false);
	// Traversal resolves before the comparison, so it cannot escape either.
	expect(withinDirectory('/app/import', '/app/import/../export/2026/secret')).toBe(false);
	expect(withinDirectory('/app/import', '/app/import/./DSCF0001.RAF')).toBe(true);
});

test('a missing root or path is never removable', () => {
	expect(withinDirectory(undefined, '/app/tmp/x.jpg')).toBe(false);
	expect(withinDirectory('/app/tmp', null)).toBe(false);
});
