import { afterEach, expect, test } from 'bun:test';
import { EditorPreviewQueue, loadEditorPreview, newPreviewId } from './editor-preview';

const originalFetch = globalThis.fetch;
const originalImage = globalThis.Image;
afterEach(() => {
	globalThis.fetch = originalFetch;
	globalThis.Image = originalImage;
});

function decodingImage(decode: () => Promise<void> = async () => {}) {
	globalThis.Image = class {
		src = '';
		decode = decode;
	} as unknown as typeof Image;
}

test('preview ids also work where crypto.randomUUID is unavailable', () => {
	const original = crypto.randomUUID;
	Object.defineProperty(crypto, 'randomUUID', { value: undefined, configurable: true });
	try {
		expect(newPreviewId()).toMatch(/^[a-z0-9]+$/);
	} finally {
		Object.defineProperty(crypto, 'randomUUID', { value: original, configurable: true });
	}
});

test('keeps the successful quick preview when refinement fails', async () => {
	decodingImage();
	const stages: string[] = [];
	globalThis.fetch = (async (input: string | URL | Request, options?: RequestInit) => {
		if (options?.cache === 'only-if-cached') return new Response(null, { status: 504 });
		if (String(input).includes('cacheOnly=1')) return new Response(null, { status: 204 });
		const stage = new URL(String(input), 'https://example.test').searchParams.get('stage')!;
		stages.push(stage);
		return stage === 'quick' ? new Response('jpeg', { headers: { 'Content-Type': 'image/jpeg' } }) : new Response(null, { status: 500 });
	}) as typeof fetch;
	const urls: string[] = [];
	await loadEditorPreview('1', 'config', 'mobile', new AbortController().signal, (url) => urls.push(url));
	expect(stages).toEqual(['quick', 'final']);
	expect(urls).toHaveLength(1);
	urls.forEach((url) => URL.revokeObjectURL(url));
});

test('a superseded request cannot publish after decoding completes', async () => {
	const controller = new AbortController();
	decodingImage(async () => {
		controller.abort();
	});
	let requests = 0;
	globalThis.fetch = (async () => {
		requests++;
		return new Response('jpeg');
	}) as unknown as typeof fetch;
	const urls: string[] = [];
	await expect(loadEditorPreview('1', 'config', 'desktop', controller.signal, (url) => urls.push(url))).rejects.toThrow();
	expect(urls).toHaveLength(0);
	expect(requests).toBe(1);
});

test('constrained connections keep the normal preview without requesting refinement', async () => {
	decodingImage();
	let requests = 0;
	globalThis.fetch = (async () => {
		requests++;
		return new Response('jpeg');
	}) as unknown as typeof fetch;
	const urls: string[] = [];
	await loadEditorPreview('1', 'config', 'constrained', new AbortController().signal, (url) => urls.push(url));
	expect(requests).toBe(1);
	expect(urls).toHaveLength(1);
	urls.forEach((url) => URL.revokeObjectURL(url));
});

for (const cache of ['browser', 'server'] as const) {
	test(`${cache}-cached refinement bypasses settling and needs no render request`, async () => {
		decodingImage();
		const calls: string[] = [];
		globalThis.fetch = (async (input: string | URL | Request, options?: RequestInit) => {
			calls.push(`${String(input)}:${options?.cache || 'default'}`);
			if (options?.cache === 'only-if-cached') return new Response(cache === 'browser' ? 'cached-jpeg' : null, { status: cache === 'browser' ? 200 : 504 });
			if (String(input).includes('cacheOnly=1')) return new Response('cached-jpeg');
			return new Response('quick-jpeg');
		}) as typeof fetch;
		const controller = new AbortController();
		// The normal mobile settling delay is 400ms; abort first to prove it was bypassed.
		const timeout = setTimeout(() => controller.abort(), 200);
		const urls: string[] = [];
		try {
			await loadEditorPreview('1', 'config', 'mobile', controller.signal, (url) => urls.push(url));
			expect(urls).toHaveLength(2);
			expect(calls).toHaveLength(cache === 'browser' ? 2 : 3);
			expect(calls.filter((call) => call.includes('stage=final') && call.endsWith(':default'))).toHaveLength(0);
		} finally {
			clearTimeout(timeout);
			urls.forEach((url) => URL.revokeObjectURL(url));
		}
	});
}

test('a running quick render finishes and only the newest waiting edit runs next', async () => {
	decodingImage();
	const requests: { config: string; stage: string; signal?: AbortSignal | null }[] = [];
	const responses: (() => void)[] = [];
	globalThis.fetch = (async (input: string | URL | Request, options?: RequestInit) => {
		if (options?.cache === 'only-if-cached' || String(input).includes('cacheOnly=1')) return new Response(null, { status: 204 });
		const params = new URL(String(input), 'https://example.test').searchParams;
		requests.push({ config: params.get('config')!, stage: params.get('stage')!, signal: options?.signal });
		await new Promise<void>((resolve) => responses.push(resolve));
		return new Response('jpeg');
	}) as typeof fetch;
	const published: { config: string; latest: boolean }[] = [];
	const previews = new EditorPreviewQueue(
		(url, _imageId, latest) => {
			published.push({ config: requests.at(-1)!.config, latest });
			URL.revokeObjectURL(url);
		},
		() => {}
	);
	const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

	previews.request('1', 'first', 'desktop');
	await settle();
	previews.request('1', 'second', 'desktop');
	previews.request('1', 'third', 'desktop');
	await settle();
	expect(requests.map((request) => request.config)).toEqual(['first']);
	expect(requests[0].signal?.aborted).toBe(false);

	responses.shift()!();
	await settle();
	await settle();
	// The first quick render was published, its refinement skipped, and the newest edit started.
	expect(published).toEqual([{ config: 'first', latest: false }]);
	expect(requests.map((request) => `${request.config}:${request.stage}`)).toEqual(['first:quick', 'third:quick']);
	previews.cancel();
	expect(requests[1].signal?.aborted).toBe(true);
});
