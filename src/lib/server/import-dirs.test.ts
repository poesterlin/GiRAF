import { expect, test } from 'bun:test';
import { importDirectories } from './import-dirs';

test('lists the upload directory first and drops blanks and duplicates', () => {
	expect(importDirectories({ IMPORT_DIR: '/a', IMPORT_EXTRA_DIRS: '/b: :/a:/c' })).toEqual(['/a', '/b', '/c']);
	expect(importDirectories({ IMPORT_DIR: '/a' })).toEqual(['/a']);
	expect(importDirectories({})).toEqual([]);
});
