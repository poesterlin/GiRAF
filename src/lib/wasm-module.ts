let modulePromise: Promise<any> | null = null;

/** Load one matching JS/WASM/worker revision; a failed load remains retryable. */
export function getRtWasm() {
	if (!globalThis.crossOriginIsolated || typeof SharedArrayBuffer === 'undefined') {
		return Promise.reject(new Error('This browser context requires reference rendering'));
	}
	if (!modulePromise) {
		const loading = (async () => {
			const manifest = await fetch('/rt-wasm-source.json', { cache: 'no-store' });
			if (!manifest.ok) throw new Error(`Unable to load WASM revision: ${manifest.status}`);
			const source: { artifacts: { file: string; sha256: string }[] } = await manifest.json();
			const revision = source.artifacts.find((artifact) => artifact.file === 'rt-wasm.wasm')?.sha256;
			if (!revision || !/^[a-f0-9]{64}$/.test(revision)) throw new Error('Invalid WASM revision');
			const scriptUrl = `/rt-wasm.js?v=${revision}`;
			const response = await fetch(scriptUrl);
			if (!response.ok) throw new Error(`Unable to load WASM module: ${response.status}`);
			const blobUrl = URL.createObjectURL(new Blob([await response.text()], { type: 'application/javascript' }));
			try {
				const module = await import(/* @vite-ignore */ blobUrl);
				const result = await module.default({
					locateFile: (path: string) => `/${path}?v=${revision}`,
					mainScriptUrlOrBlob: new URL(scriptUrl, location.origin).href
				});
				await result.ready;
				return result;
			} finally {
				URL.revokeObjectURL(blobUrl);
			}
		})();
		let timer: ReturnType<typeof setTimeout>;
		const timeout = new Promise<never>((_, reject) => {
			timer = setTimeout(() => reject(new Error('WASM initialization timed out')), 12000);
		});
		modulePromise = Promise.race([loading, timeout]).finally(() => clearTimeout(timer)).catch((error) => {
			modulePromise = null;
			throw error;
		});
	}
	return modulePromise;
}
