import { createSHA256 } from 'hash-wasm';
import { importTiming } from './import-timing';

export type DuplicateResult = { key: string; duplicate: boolean; imported: boolean; id?: number };
const fingerprints = new WeakMap<File, Promise<string>>();

export function cacheFileFingerprint(file: File, sha256: string) {
	if (!/^[a-f0-9]{64}$/.test(sha256)) throw new Error('Invalid file fingerprint');
	fingerprints.set(file, Promise.resolve(sha256));
}

/** Hash in bounded chunks; never buffer a complete RAW file in browser memory. */
export function fingerprintFile(file: File): Promise<string> {
	const cached = fingerprints.get(file);
	if (cached) return cached;
	const result = (async () => {
		const hash = await createSHA256();
		hash.init();
		const chunkSize = 1024 * 1024;
		let readMs = 0;
		let hashMs = 0;
		const started = performance.now();
		for (let offset = 0; offset < file.size; offset += chunkSize) {
			const readStarted = performance.now();
			const bytes = new Uint8Array(await file.slice(offset, offset + chunkSize).arrayBuffer());
			readMs += performance.now() - readStarted;
			const hashStarted = performance.now();
			hash.update(bytes);
			hashMs += performance.now() - hashStarted;
			if (offset === 0 || offset + chunkSize >= file.size || performance.now() - readStarted > 1000) {
				importTiming('hash.read-progress', started, {
					file: file.name,
					loaded: Math.min(offset + chunkSize, file.size),
					bytes: file.size,
					readMs: Math.round(readMs),
					hashMs: Math.round(hashMs)
				});
			}
		}
		return hash.digest('hex');
	})();
	fingerprints.set(file, result);
	void result.catch(() => fingerprints.delete(file));
	return result;
}

export async function checkUploadDuplicates(files: File[]): Promise<DuplicateResult[]> {
	const results: DuplicateResult[] = [];
	for (let start = 0; start < files.length; start += 100) {
		const candidates = [];
		for (let index = start; index < Math.min(start + 100, files.length); index++) {
			const file = files[index];
			candidates.push({ key: String(index), name: file.name, size: file.size, sha256: await fingerprintFile(file) });
		}
		const response = await fetch('/api/imports/duplicates', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ files: candidates })
		});
		if (!response.ok) throw new Error(`Duplicate check failed (${response.status}); no files have been uploaded`);
		const payload: { results: DuplicateResult[] } = await response.json();
		if (!Array.isArray(payload.results) || candidates.some((candidate) => !payload.results.some((result) => result.key === candidate.key))) {
			throw new Error('Duplicate check returned an incomplete result');
		}
		results.push(...payload.results);
	}
	return results;
}
