import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import pLimit from 'p-limit';
import { db } from '$lib/server/db';
import { importTable } from '$lib/server/db/schema';

const ioLimit = pLimit(2);
const fingerprints = new Map<string, { signature: string; promise: Promise<string> }>();
let sizeScan: Promise<void> | undefined;

function unavailable(error: unknown) {
	return ['ENOENT', 'ENOTDIR', 'EACCES'].includes((error as NodeJS.ErrnoException).code ?? '');
}

async function hashFile(filePath: string, size: number, mtimeMs: number, ctimeMs: number) {
	const signature = `${size}:${mtimeMs}:${ctimeMs}`;
	const cached = fingerprints.get(filePath);
	if (cached?.signature === signature) return cached.promise;
	const promise = (async () => {
		const hash = createHash('sha256');
		for await (const chunk of createReadStream(filePath)) hash.update(chunk);
		const after = await stat(filePath);
		if (`${after.size}:${after.mtimeMs}:${after.ctimeMs}` !== signature) {
			throw new Error(`Import file changed while fingerprinting: ${filePath}`);
		}
		return hash.digest('hex');
	})();
	fingerprints.set(filePath, { signature, promise });
	try {
		return await promise;
	} catch (error) {
		if (fingerprints.get(filePath)?.promise === promise) fingerprints.delete(filePath);
		throw error;
	}
}

async function backfillSizes() {
	const rows = await db.query.importTable.findMany({
		where: isNull(importTable.fileSize),
		columns: { id: true, filePath: true }
	});
	await Promise.all(
		rows.map((row) =>
			ioLimit(async () => {
				let info;
				try {
					info = await stat(row.filePath);
				} catch (error) {
					if (unavailable(error)) return;
					throw error;
				}
				if (!info.isFile()) return;
				await db.update(importTable).set({ fileSize: info.size }).where(eq(importTable.id, row.id));
			})
		)
	);
}

/** Stat legacy sources first; only read RAW bytes for sizes in this request. */
export async function backfillImportFingerprints(sizes: number[]) {
	if (!sizes.length) return;
	if (!sizeScan)
		sizeScan = backfillSizes().finally(() => {
			sizeScan = undefined;
		});
	await sizeScan;
	const rows = await db.query.importTable.findMany({
		where: and(isNull(importTable.contentHash), inArray(importTable.fileSize, [...new Set(sizes)])),
		columns: { id: true, filePath: true }
	});
	await Promise.all(
		rows.map((row) =>
			ioLimit(async () => {
				let contentHash: string;
				let info;
				try {
					info = await stat(row.filePath);
					if (!info.isFile()) return;
					contentHash = await hashFile(row.filePath, info.size, info.mtimeMs, info.ctimeMs);
				} catch (error) {
					if (unavailable(error)) return;
					throw error;
				}
				await db.update(importTable).set({ contentHash, fileSize: info.size }).where(eq(importTable.id, row.id));
			})
		)
	);
}

export async function findImportDuplicate(sha256: string, size: number) {
	return db.query.importTable.findFirst({
		where: and(eq(importTable.contentHash, sha256.toLowerCase()), eq(importTable.fileSize, size)),
		orderBy: [importTable.id],
		columns: { id: true, importedAt: true, date: true }
	});
}
