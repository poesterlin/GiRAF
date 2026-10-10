import { afterEach, expect, test } from 'bun:test';
import { loadEditorPreview } from './editor-preview';

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
	decodingImage(async () => { controller.abort(); });
	let requests = 0;
	globalThis.fetch = (async () => { requests++; return new Response('jpeg'); }) as unknown as typeof fetch;
	const urls: string[] = [];
	await expect(loadEditorPreview('1', 'config', 'desktop', controller.signal, (url) => urls.push(url))).rejects.toThrow();
	expect(urls).toHaveLength(0);
	expect(requests).toBe(1);
});

test('constrained connections keep the normal preview without requesting refinement', async () => {
	decodingImage();
	let requests = 0;
	globalThis.fetch = (async () => { requests++; return new Response('jpeg'); }) as unknown as typeof fetch;
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
		// The normal mobile settling delay is 800ms; abort first to prove it was bypassed.
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
