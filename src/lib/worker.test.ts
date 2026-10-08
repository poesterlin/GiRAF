import { afterAll, expect, mock, test } from 'bun:test';
import type { ImageWorker } from './worker';

let worker: ImageWorker;
mock.module('comlink', () => ({
	expose: (methods: ImageWorker) => {
		worker = methods;
	}
}));
await import('./worker');
const originalFetch = globalThis.fetch;
afterAll(() => {
	globalThis.fetch = originalFetch;
});

test('unverified WASM routes to reference without requiring browser storage', async () => {
	const config = btoa('[Exposure]\nCompensation=1');
	const urls: string[] = [];
	globalThis.fetch = mock(async (input: string | URL | Request) => {
		urls.push(String(input));
		return new Response(new Uint8Array([1, 2, 3]), { headers: { 'Content-Type': 'image/jpeg' } });
	}) as unknown as typeof fetch;
	const result = await worker.refreshImage('123', config);
	expect(result.error).toBe(false);
	expect(result.url.startsWith('blob:')).toBe(true);
	expect(urls).toHaveLength(1);
	expect(new URL(urls[0], 'https://example.test').searchParams.get('config')).toBe(config);
	expect(urls[0]).toContain('/api/images/123/edit?');
	URL.revokeObjectURL(result.url);
});

test('failed reference render is reported as an error, never a cached success', async () => {
	globalThis.fetch = mock(async () => new Response('Render failed', { status: 500 })) as unknown as typeof fetch;
	const result = await worker.refreshImage('124', 'a+b/c==');
	expect(result.error).toBe(true);
	expect(result.url).toContain('config=a%2Bb%2Fc%3D%3D');
});

test('queued intermediate edits are discarded while the current render completes', async () => {
	let finishFirst!: (response: Response) => void;
	let signalStarted!: () => void;
	const started = new Promise<void>((resolve) => {
		signalStarted = resolve;
	});
	const urls: string[] = [];
	globalThis.fetch = mock(async (input: string | URL | Request) => {
		urls.push(String(input));
		if (urls.length === 1) {
			signalStarted();
			return new Promise<Response>((resolve) => {
				finishFirst = resolve;
			});
		}
		return new Response(new Uint8Array([4, 5, 6]));
	}) as unknown as typeof fetch;
	const first = worker.refreshImage('125', 'first');
	await started;
	const intermediate = worker.refreshImage('125', 'intermediate');
	const latest = worker.refreshImage('125', 'latest');
	finishFirst(new Response(new Uint8Array([1, 2, 3])));
	const results = await Promise.all([first, intermediate, latest]);
	expect(urls).toHaveLength(2);
	expect(urls[1]).toContain('config=latest');
	expect(results[1].url).toBe('');
	expect(results[0].error).toBe(false);
	expect(results[2].error).toBe(false);
	for (const result of results) if (result.url.startsWith('blob:')) URL.revokeObjectURL(result.url);
});
