import { expect, mock, test } from 'bun:test';

mock.module('$env/dynamic/private', () => ({ env: {} }));

const { isLeftover } = await import('./tmp-sweep');
const uuid = '1b6540dc-3d73-4776-9639-f3dfba1d41be';

test('render working folders are leftovers only while they hold nothing but render files', () => {
	expect(isLeftover(`DSCF0001.tif-${uuid}`, ['edit.pp3'], false)).toBe(true);
	expect(isLeftover(`DSCF0001.tif-${uuid}`, ['edit.pp3', 'edited.jpg'], false)).toBe(true);
	expect(isLeftover(`DSCF0001.tif-${uuid}`, ['edit.pp3', 'notes.txt'], false)).toBe(false);
});

test('old export TIFF folders are leftovers', () => {
	expect(isLeftover('DSCF0003.RAF-export-tiff', ['DSCF0003.tif', 'DSCF0003.tif.pp3', 'edit.pp3'], false)).toBe(true);
	expect(isLeftover(`DSCF0003.RAF-export-tiff-${uuid}`, ['DSCF0003.tif', 'edit.pp3'], false)).toBe(true);
});

test('editor TIFFs and unknown folders are kept', () => {
	expect(isLeftover(`DSCF0001.RAF-tiff-${uuid}`, ['DSCF0001.tif', 'edit.pp3'], false)).toBe(false);
	expect(isLeftover('DSCF0001.RAF-tiff', ['DSCF0001.tif'], false)).toBe(false);
	expect(isLeftover('develop-cache', [], false)).toBe(false);
	expect(isLeftover('thumbnails', [], false)).toBe(false);
});

test('only interrupted builds are removed from the develop cache', () => {
	expect(isLeftover(`.build-abc-${uuid}`, ['x.tif'], true)).toBe(true);
	expect(isLeftover('abc.tif', [], true)).toBe(false);
});
