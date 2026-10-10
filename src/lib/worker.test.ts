import { afterAll, expect, mock, test } from 'bun:test';
import type { ImageWorker } from './worker';
import { fixtureTiff } from '../../scripts/preview-parity/fixtures';

let worker: ImageWorker;
mock.module('comlink', () => ({
	expose: (methods: ImageWorker) => {
		worker = methods;
	}
}));
let nativeModule: ReturnType<typeof fakeModule> | null = null;
let runtimeReady: Promise<void> | undefined;
mock.module('./wasm-module', () => ({
	getRtWasm: async () => {
		await runtimeReady;
		if (!nativeModule) throw new Error('Native runtime unavailable');
		return nativeModule;
	}
}));

function fakeModule() {
	let pointer = 1024;
	return {
		HEAPU8: new Uint8Array(1024 * 1024),
		loads: 0,
		renders: 0,
		_malloc: (size: number) => {
			const result = pointer;
			pointer += size;
			return result;
		},
		_free: () => {},
		_load_tiff_image() {
			this.loads++;
			return 1;
		},
		_render_tiff_image() {
			this.renders++;
			this.HEAPU8.set([1, 2, 3], 8);
			return 0;
		},
		_release_tiff_image: () => 0,
		_get_output_size: () => 3,
		_get_output_data: () => 8,
		_free_output: () => {}
	};
}
await import('./worker');
const originalFetch = globalThis.fetch;
afterAll(() => {
	globalThis.fetch = originalFetch;
});

test('unsupported tools route to reference without requiring browser storage', async () => {
	const config = btoa('[Sharpening]\nEnabled=true\nAmount=50');
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
	const config = btoa('[Sharpening]\nEnabled=true\nAmount=50');
	globalThis.fetch = mock(async () => new Response('Render failed', { status: 500 })) as unknown as typeof fetch;
	const result = await worker.refreshImage('124', config);
	expect(result.error).toBe(true);
	expect(new URL(result.url, 'https://example.test').searchParams.get('config')).toBe(config);
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
	const config = (amount: number) => btoa(`[Sharpening]\nEnabled=true\nAmount=${amount}`);
	const first = worker.refreshImage('125', config(50));
	await started;
	const intermediate = worker.refreshImage('125', config(75));
	const latest = worker.refreshImage('125', config(100));
	finishFirst(new Response(new Uint8Array([1, 2, 3])));
	const results = await Promise.all([first, intermediate, latest]);
	expect(urls).toHaveLength(2);
	expect(new URL(urls[1], 'https://example.test').searchParams.get('config')).toBe(config(100));
	expect(results[1].url).toBe('');
	expect(results[0].error).toBe(false);
	expect(results[2].error).toBe(false);
	for (const result of results) if (result.url.startsWith('blob:')) URL.revokeObjectURL(result.url);
});

test('TIFF download starts while the WASM runtime is still initializing', async () => {
	nativeModule = fakeModule();
	let releaseRuntime!: () => void;
	runtimeReady = new Promise<void>((resolve) => { releaseRuntime = resolve; });
	let downloaded = false;
	globalThis.fetch = mock(async () => {
		downloaded = true;
		return new Response(fixtureTiff(16));
	}) as unknown as typeof fetch;
	const render = worker.refreshImage('parallel-init', btoa('[Exposure]\nAuto=true'));
	try {
		// Flush promise continuations without relying on wall-clock timing.
		for (let i = 0; i < 10; i++) await Promise.resolve();
		expect(downloaded).toBe(true);
		expect(nativeModule.renders).toBe(0);
	} finally {
		releaseRuntime();
		runtimeReady = undefined;
	}
	const result = await render;
	expect(result.error).toBe(false);
	expect(nativeModule.renders).toBe(1);
	if (result.url.startsWith('blob:')) URL.revokeObjectURL(result.url);
});

test('supported edits reuse TIFF bytes and one decoded handle without browser storage', async () => {
	nativeModule = fakeModule();
	const module = nativeModule;
	const urls: string[] = [];
	globalThis.fetch = mock(async (input: string | URL | Request) => {
		urls.push(String(input));
		return new Response(fixtureTiff(16));
	}) as unknown as typeof fetch;
	for (const pp3 of ['[Exposure]\nAuto=true', '[Exposure]\nAuto=false\nCompensation=1\n[Dehaze]\nEnabled=true\nStrength=0\nDepth=25\nSaturation=50\nShowDepthMap=false', '[Exposure]\nAuto=true']) {
		const result = await worker.refreshImage('200', btoa(pp3));
		expect(result.error).toBe(false);
		URL.revokeObjectURL(result.url);
	}
	expect(urls).toEqual(['/api/images/200/tiff']);
	expect(module.loads).toBe(1);
	expect(module.renders).toBe(3);
});

test('failed required LUT uses reference rendering rather than rendering without film simulation', async () => {
	nativeModule = fakeModule();
	const module = nativeModule;
	const urls: string[] = [];
	globalThis.fetch = mock(async (input: string | URL | Request) => {
		const url = String(input);
		urls.push(url);
		if (url.includes('/luts/clut?')) return new Response('Missing film', { status: 404 });
		return new Response(url.endsWith('/tiff') ? fixtureTiff(16) : new Uint8Array([1, 2, 3]));
	}) as unknown as typeof fetch;
	const result = await worker.refreshImage('201', btoa('[Film Simulation]\nEnabled=true\nStrength=100\nClutFilename=/missing.png'));
	expect(result.error).toBe(false);
	expect(module.renders).toBe(0);
	expect(urls.some((url) => url.includes('/api/images/201/edit?'))).toBe(true);
	URL.revokeObjectURL(result.url);
	nativeModule = null;
});
