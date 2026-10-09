import { mkdir, readdir, rename } from 'node:fs/promises';
import { dirname, join, basename } from 'node:path';
import type { Image, Session } from './db/schema';

export function makeSessionPath(session: Session): string {
	const startedAt = new Date(session.startedAt);
	const year = startedAt.getFullYear();
	const month = (startedAt.getMonth() + 1).toString().padStart(2, '0');
	const day = startedAt.getDate().toString().padStart(2, '0');
	return join(process.env.EXPORT_DIR || '/app/export', year.toString(), `${year}-${month}-${day}_${session.name}`);
}

export function makeOutputPath(image: Image, session: Session): string {
	const totalImages = (session as Session & { images?: unknown[] }).images?.length ?? 100;
	const digits = Math.max(2, Math.ceil(Math.log10(totalImages + 1)));
	return join(makeSessionPath(session), `${image.id.toString().padStart(digits, '0')}_${session.name}.jpg`);
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
