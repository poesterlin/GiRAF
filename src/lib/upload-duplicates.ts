import { createSHA256 } from 'hash-wasm';

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
		for (let offset = 0; offset < file.size; offset += chunkSize) {
			hash.update(new Uint8Array(await file.slice(offset, offset + chunkSize).arrayBuffer()));
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
