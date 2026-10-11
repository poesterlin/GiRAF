import { test, expect } from 'bun:test';
import { createHash } from 'node:crypto';
import { uploadResumable } from './resumable-upload';

type Reply = { status?: number; payload?: unknown; networkError?: boolean };

async function withTransport(
	replies: Reply[],
	run: (requests: { method: string; url: string; body?: XMLHttpRequestBodyInit; headers: Record<string, string> }[]) => Promise<void>
) {
	const original = globalThis.XMLHttpRequest;
	const requests: { method: string; url: string; body?: XMLHttpRequestBodyInit; headers: Record<string, string> }[] = [];
	class RequestMock {
		method = '';
		url = '';
		headers: Record<string, string> = {};
		status = 0;
		responseText = '';
		timeout = 0;
		upload: { onprogress?: (event: { loaded: number }) => void; onload?: () => void } = {};
		onload?: () => void;
		onerror?: () => void;
		open(method: string, url: string) {
			this.method = method;
			this.url = url;
		}
		setRequestHeader(key: string, value: string) {
			this.headers[key] = value;
		}
		send(body?: XMLHttpRequestBodyInit) {
			requests.push({ method: this.method, url: this.url, body, headers: this.headers });
			const reply = replies.shift();
			if (!reply) throw new Error('Unexpected request');
			queueMicrotask(() => {
				if (body instanceof Uint8Array) {
					this.upload.onprogress?.({ loaded: Math.floor(body.length / 2) });
					this.upload.onprogress?.({ loaded: body.length });
					this.upload.onload?.();
				}
				if (reply.networkError) {
					this.onerror?.();
					return;
				}
				this.status = reply.status ?? 200;
				this.responseText = JSON.stringify(reply.payload ?? { ok: true });
				this.onload?.();
			});
		}
	}
	globalThis.XMLHttpRequest = RequestMock as unknown as typeof XMLHttpRequest;
	try {
		await run(requests);
		expect(replies).toHaveLength(0);
	} finally {
		globalThis.XMLHttpRequest = original;
	}
}

test('browser resumes sparse saved chunks and retransmits only an unacknowledged chunk', async () => {
	const bytes = new Uint8Array(600_000).fill(9);
	const file = new File([bytes], 'photo.RAF');
	const hash = createHash('sha256').update(bytes).digest('hex');
	let wireBytes = 0;
	const progress: number[] = [];
	let sending = false;
	await withTransport(
		[
			{ payload: { complete: false, chunkSize: 256 * 1024, chunks: [1] } },
			{ networkError: true },
			{},
			{},
			{ payload: { results: [{ status: 'success', id: 17, date: '2026-10-11' }] } }
		],
		async (requests) => {
			const result = await uploadResumable(file, hash, {
				onBytes: (delta) => {
					wireBytes += delta;
				},
				onProgress: (value) => progress.push(value),
				onSending: (value) => {
					sending = value;
				}
			});
			expect(result.id).toBe(17);
			expect(requests.map((request) => request.method)).toEqual(['GET', 'PUT', 'PUT', 'PUT', 'POST']);
			expect(requests.filter((request) => request.method === 'PUT').map((request) => request.url.split('?')[1])).toEqual(['chunk=0', 'chunk=0', 'chunk=2']);
			for (const request of requests.filter((request) => request.method === 'PUT')) {
				expect(request.headers['X-Chunk-SHA256']).toBe(
					createHash('sha256')
						.update(request.body as Uint8Array)
						.digest('hex')
				);
			}
			expect(wireBytes).toBe(file.size);
			expect(progress[0]).toBe(256 * 1024);
			expect(progress.at(-1)).toBe(file.size);
			expect(Math.max(...progress)).toBe(file.size);
			expect(sending).toBe(false);
		}
	);
});

test('browser uses completion receipts without retransmitting file data', async () => {
	await withTransport([{ payload: { complete: true, result: { results: [{ status: 'skipped', id: 5 }] } } }], async (requests) => {
		const result = await uploadResumable(new File(['raw'], 'photo.nef'), 'a'.repeat(64), {
			onBytes: () => {
				throw new Error('No file transfer expected');
			},
			onProgress: () => {},
			onSending: () => {}
		});
		expect(result).toEqual({ status: 'skipped', id: 5 });
		expect(requests).toHaveLength(1);
	});
});

test('browser retries temporary HTTP failures but surfaces permanent errors', async () => {
	await withTransport([{ status: 503 }, { status: 403 }], async (requests) => {
		await expect(uploadResumable(new File(['raw'], 'photo.nef'), 'b'.repeat(64), { onBytes: () => {}, onProgress: () => {}, onSending: () => {} })).rejects.toThrow('403');
		expect(requests).toHaveLength(2);
	});
});
