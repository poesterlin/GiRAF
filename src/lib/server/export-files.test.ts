import { expect, test } from 'bun:test';
import { mkdtemp, readFile, writeFile, rm, access, mkdir } from 'node:fs/promises';
import { join, dirname, basename } from 'node:path';
import { moveExportFile, makeOutputPath, findExportPath, exportImageId } from './export-files';
import type { Image, Session } from './db/schema';

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

test('capture timestamps sort chronologically regardless of image ID', () => {
	const session = { name: 'trip', startedAt: new Date('2026-10-08T00:00:00Z') } as Session;
	const earlier = { id: 1731, recordedAt: new Date('2026-10-08T08:34:12Z') } as Image;
	const later = { id: 1690, recordedAt: new Date('2026-10-08T08:34:15Z') } as Image;
	expect(basename(makeOutputPath(earlier, session))).toBe('261008_083412_1731.jpg');
	expect([makeOutputPath(later, session), makeOutputPath(earlier, session)].sort()).toEqual([makeOutputPath(earlier, session), makeOutputPath(later, session)]);
	expect(exportImageId('261008_083412_1731.jpg')).toBe(1731);
	expect(exportImageId('01731_trip.jpg')).toBe(1731);
	expect(exportImageId('unrelated.jpg')).toBeUndefined();
});

test('existing export names stay unchanged and still support lookup and archive/restore', async () => {
	const directory = await mkdtemp('/tmp/opencode/export-names-');
	const oldExportDir = process.env.EXPORT_DIR;
	process.env.EXPORT_DIR = directory;
	try {
		const image = { id: 1731, recordedAt: new Date('2026-10-08T08:34:12Z') } as Image;
		const other = { id: 1690, recordedAt: new Date('2026-10-08T08:34:15Z') } as Image;
		const session = { name: 'trip', startedAt: new Date('2026-10-08T00:00:00Z'), images: [image, other] } as Session & { images: Image[] };
		const path = makeOutputPath(image, session);
		await mkdir(join(dirname(path), 'archived'), { recursive: true });
		await writeFile(join(dirname(path), '01731_trip.jpg'), 'active');
		await writeFile(join(dirname(path), 'archived', '1690_trip.jpg'), 'archived');
		expect(await findExportPath(image, session)).toBe(join(dirname(path), '01731_trip.jpg'));
		expect(await readFile(join(dirname(path), '01731_trip.jpg'), 'utf8')).toBe('active');
		expect(await readFile(join(dirname(path), 'archived', '1690_trip.jpg'), 'utf8')).toBe('archived');
		await moveExportFile(path, true);
		await moveExportFile(path, false);
		expect(await readFile(join(dirname(path), '01731_trip.jpg'), 'utf8')).toBe('active');
	} finally {
		if (oldExportDir === undefined) delete process.env.EXPORT_DIR;
		else process.env.EXPORT_DIR = oldExportDir;
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
