import { mkdir, readdir, rename, stat } from 'node:fs/promises';
import { dirname, join, basename } from 'node:path';
import type { Image, Session } from './db/schema';

export function makeSessionPath(session: Session): string {
	const startedAt = new Date(session.startedAt);
	const year = startedAt.getFullYear();
	const month = (startedAt.getMonth() + 1).toString().padStart(2, '0');
	const day = startedAt.getDate().toString().padStart(2, '0');
	return join(process.env.EXPORT_DIR || '/app/export', year.toString(), `${year}-${month}-${day}_${session.name}`);
}

export function makeOutputPath(image: Pick<Image, 'id' | 'recordedAt'>, session: Session): string {
	const date = new Date(image.recordedAt);
	const pad = (value: number) => String(value).padStart(2, '0');
	const day = `${pad(date.getUTCFullYear() % 100)}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}`;
	const time = `${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}`;
	return join(makeSessionPath(session), `${day}_${time}_${image.id}.jpg`);
}

export function exportImageId(filename: string): number | undefined {
	const match = filename.match(/^\d{6}_\d{6}_(\d+)\.jpg$/) ?? filename.match(/^(\d+)_.*\.jpg$/);
	return match ? Number(match[1]) : undefined;
}

export async function findExportPath(image: Pick<Image, 'id' | 'recordedAt'>, session: Session): Promise<string> {
	const path = makeOutputPath(image, session);
	try { await stat(path); return path; } catch (error) {
		if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
	}
	try {
		const names = await readdir(dirname(path));
		const legacy = names.sort().find((name) => exportImageId(name) === image.id);
		return legacy ? join(dirname(path), legacy) : path;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
		return path;
	}
}

export async function moveExportFile(outputPath: string, archived: boolean): Promise<void> {
	const archivedPath = join(dirname(outputPath), 'archived', basename(outputPath));
	const source = archived ? outputPath : archivedPath;
	const destination = archived ? archivedPath : outputPath;
	let names: string[];
	try {
		names = await readdir(dirname(source));
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
		return;
	}
	const filename = basename(outputPath);
	if (/^\d{6}_\d{6}_\d+\.jpg$/.test(filename)) {
		const matches = names.filter((name) => exportImageId(name) === exportImageId(filename));
		if (!matches.length) return;
		await mkdir(dirname(destination), { recursive: true });
		for (const name of matches) {
			try { await rename(join(dirname(source), name), join(dirname(destination), name)); } catch (error) {
				if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
			}
		}
		return;
	}
	const separator = filename.indexOf('_');
	const id = Number(filename.slice(0, separator));
	// Older exports can use different ID padding as the session size changes.
	const matches = names.filter((name) => {
		const index = name.indexOf('_');
		return /^\d+$/.test(name.slice(0, index)) && Number(name.slice(0, index)) === id && name.slice(index) === filename.slice(separator);
	});
	if (!matches.length) return;
	await mkdir(dirname(destination), { recursive: true });
	for (const name of matches) {
		try {
			await rename(join(dirname(source), name), join(dirname(destination), name));
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
		}
	}
}
