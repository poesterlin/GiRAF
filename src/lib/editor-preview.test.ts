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
	globalThis.fetch = (async (input: string | URL | Request) => {
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
