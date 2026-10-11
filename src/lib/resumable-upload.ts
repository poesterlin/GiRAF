import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';

export type UploadResult = { status: 'success' | 'skipped' | 'error'; id?: number; date?: string; message?: string };
type RequestOptions = {
	method?: string;
	body?: XMLHttpRequestBodyInit;
	headers?: Record<string, string>;
	onBytes?: (delta: number) => void;
	onProgress?: (loaded: number) => void;
	onSending?: (sending: boolean) => void;
};

class UploadHttpError extends Error {
	constructor(
		message: string,
		readonly status: number
	) {
		super(message);
	}
}

/** Only acknowledged chunks count as durable progress; retries still count as wire bytes. */
export async function uploadRequest<T>(url: string, options: RequestOptions = {}): Promise<T> {
	for (let attempt = 0; ; attempt++) {
		try {
			return await new Promise<T>((resolve, reject) => {
				const request = new XMLHttpRequest();
				request.open(options.method ?? 'GET', url);
				request.timeout = 540_000;
				for (const [key, value] of Object.entries(options.headers ?? {})) request.setRequestHeader(key, value);
				let observed = 0;
				request.upload.onprogress = (event) => {
					options.onBytes?.(Math.max(0, event.loaded - observed));
					observed = event.loaded;
					options.onProgress?.(event.loaded);
				};
				request.upload.onload = () => options.onSending?.(false);
				request.onload = () => {
					options.onSending?.(false);
					if (request.status < 200 || request.status >= 300) {
						reject(new UploadHttpError(`Upload request failed (${request.status})`, request.status));
						return;
					}
					try {
						resolve(JSON.parse(request.responseText));
					} catch {
						reject(new UploadHttpError('Invalid upload response', 400));
					}
				};
				const interrupted = () => {
					options.onSending?.(false);
					reject(new Error('Upload connection interrupted'));
				};
				request.onerror = interrupted;
				request.ontimeout = interrupted;
				request.onabort = interrupted;
				options.onProgress?.(0);
				options.onSending?.(!!options.body);
				request.send(options.body);
			});
		} catch (error) {
			options.onSending?.(false);
			if (error instanceof UploadHttpError && error.status < 500 && ![408, 425, 429].includes(error.status)) throw error;
			const delay = Math.min(60_000, 1000 * 2 ** Math.min(attempt, 6)) * (0.75 + Math.random() * 0.5);
			await new Promise((resolve) => setTimeout(resolve, delay));
		}
	}
}

export async function uploadResumable(
	file: File,
	hash: string,
	callbacks: {
		onBytes: (delta: number) => void;
		onProgress: (loaded: number) => void;
		onSending: (sending: boolean) => void;
	}
): Promise<UploadResult> {
	if (!file.size || file.size > 512 * 1024 * 1024) throw new Error('RAW file must be between 1 byte and 512 MiB');
	if (!/^[a-f0-9]{64}$/.test(hash)) throw new Error('Invalid file fingerprint');
	const url = `/api/imports/resumable/${hash}`;
	const status = await uploadRequest<{ complete: boolean; result?: { results: UploadResult[] }; chunks?: number[]; chunkSize?: number }>(url);
	let payload = status.result;
	if (!status.complete) {
		const chunkSize = status.chunkSize;
		if (chunkSize !== 256 * 1024 || !Array.isArray(status.chunks)) throw new Error('Unsupported resumable upload protocol');
		const count = Math.ceil(file.size / chunkSize);
		if (status.chunks.some((chunk) => !Number.isInteger(chunk) || chunk < 0 || chunk >= count)) throw new Error('Invalid saved upload chunks');
		const saved = new Set(status.chunks);
		let acknowledged = [...saved].reduce((sum, chunk) => sum + Math.min(chunkSize, file.size - chunk * chunkSize), 0);
		callbacks.onProgress(acknowledged);
		for (let chunk = 0; chunk < count; chunk++) {
			if (saved.has(chunk)) continue;
			const bytes = new Uint8Array(await file.slice(chunk * chunkSize, (chunk + 1) * chunkSize).arrayBuffer());
			await uploadRequest(`${url}?chunk=${chunk}`, {
				method: 'PUT',
				body: bytes,
				headers: { 'Content-Type': 'application/octet-stream', 'X-Chunk-SHA256': bytesToHex(sha256(bytes)) },
				onBytes: callbacks.onBytes,
				onSending: callbacks.onSending,
				onProgress: (loaded) => callbacks.onProgress(acknowledged + Math.min(loaded, bytes.length))
			});
			acknowledged += bytes.length;
			callbacks.onProgress(acknowledged);
		}
		payload = await uploadRequest<{ results: UploadResult[] }>(url, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ name: file.name, size: file.size })
		});
	}
	const result = payload?.results?.[0];
	if (!result || !['success', 'skipped'].includes(result.status)) throw new Error(result?.message ?? 'File processing failed');
	callbacks.onProgress(file.size);
	return result;
}
