import { error, json, type RequestHandler } from '@sveltejs/kit';
import { backfillImportFingerprints, findImportDuplicate } from '$lib/server/import-fingerprints';

interface Fingerprint {
	key: string;
	name: string;
	size: number;
	sha256: string;
}

function isFingerprint(value: unknown): value is Fingerprint {
	if (!value || typeof value !== 'object') return false;
	const file = value as Fingerprint;
	return (
		typeof file.key === 'string' &&
		file.key.length > 0 &&
		file.key.length <= 1024 &&
		typeof file.name === 'string' &&
		file.name.length > 0 &&
		file.name.length <= 1024 &&
		Number.isSafeInteger(file.size) &&
		file.size >= 0 &&
		typeof file.sha256 === 'string' &&
		/^[a-f0-9]{64}$/i.test(file.sha256)
	);
}

export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json().catch(() => error(400, 'Invalid JSON'));
	if (!body || !Array.isArray(body.files) || body.files.length > 100 || !body.files.every(isFingerprint)) {
		error(400, 'Expected at most 100 files with key, name, size and SHA256');
	}
	const files: Fingerprint[] = body.files;
	const started = performance.now();
	await backfillImportFingerprints(files.map((file) => file.size));
	const indexed = performance.now();
	const results = await Promise.all(
		files.map(async (file) => {
			const existing = await findImportDuplicate(file.sha256, file.size);
			return {
				key: file.key,
				duplicate: !!existing,
				imported: !!existing?.importedAt,
				...(existing ? { date: existing.date } : {}),
				...(existing && !existing.importedAt ? { id: existing.id } : {})
			};
		})
	);
	console.info('[import-timing:server]', {
		stage: 'duplicates',
		files: files.length,
		indexMs: Math.round(indexed - started),
		lookupMs: Math.round(performance.now() - indexed),
		duplicates: results.filter((result) => result.duplicate).length
	});
	return json({ results });
};
