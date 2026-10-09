import { expect, test } from 'bun:test';
import { mkdtemp, readFile, writeFile, rm, access } from 'node:fs/promises';
import { join } from 'node:path';
import { moveExportFile } from './export-files';

test('archive and restore preserve JPEG bytes and tolerate repeated operations and unexported images', async () => {
	const directory = await mkdtemp('/tmp/opencode/export-files-');
	try {
		const path = join(directory, '001_trip.jpg');
		await writeFile(path, 'original jpeg');
		await moveExportFile(path, true);
		await expect(access(path)).rejects.toThrow();
		expect(await readFile(join(directory, 'archived', '001_trip.jpg'), 'utf8')).toBe('original jpeg');
		await moveExportFile(path, true);
		await moveExportFile(path, false);
		expect(await readFile(path, 'utf8')).toBe('original jpeg');
		await moveExportFile(path, false);
		await moveExportFile(join(directory, '002_trip.jpg'), true);
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
});

test('moves old ID padding variants without touching other photos', async () => {
	const directory = await mkdtemp('/tmp/opencode/export-files-');
	try {
		await writeFile(join(directory, '01_trip.jpg'), 'old padding');
		await writeFile(join(directory, '002_trip.jpg'), 'other image');
		await moveExportFile(join(directory, '001_trip.jpg'), true);
		expect(await readFile(join(directory, 'archived', '01_trip.jpg'), 'utf8')).toBe('old padding');
		expect(await readFile(join(directory, '002_trip.jpg'), 'utf8')).toBe('other image');
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
});
