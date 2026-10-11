import { afterEach, expect, mock, test } from 'bun:test';
import { compileModule } from 'svelte/compiler';
import type { UploadOptions } from './uploads.svelte';

// Exercise the actual rune-based controller with the browser runtime.
const transpiler = new Bun.Transpiler({ loader: 'ts' });
Bun.plugin({
	name: 'importer-state-test',
	setup(build) {
		build.onLoad({ filter: /importer\.svelte\.ts$/ }, async ({ path }) => ({
			contents: compileModule(transpiler.transformSync(await Bun.file(path).text()), { filename: path, generate: 'client' }).js.code,
			loader: 'js'
		}));
	}
});
let callbacks: UploadOptions;
let uploaded: File[] = [];
let preview: Promise<{ url: string; capturedAt?: Date }> = Promise.resolve({ url: 'blob:test' });
let previewRequests: File[] = [];
mock.module('./uploads.svelte', () => ({ uploads: { upload: async (files: File[], _target: unknown, options: UploadOptions) => { uploaded = files; callbacks = options; } } }));
mock.module('$lib/local-preview-client', () => ({ getLocalPreview: (file: File) => { previewRequests.push(file); return preview; }, releaseLocalPreviewWorker: () => {} }));
mock.module('$lib/import-timing', () => ({ importTiming: () => {} }));
mock.module('$app/navigation', () => ({ invalidateAll: async () => {} }));
mock.module('./app.svelte', () => ({ app: { addToast: () => {} } }));
const { ImporterState } = await import('./importer.svelte');
const originalFetch = globalThis.fetch;
const originalRevoke = URL.revokeObjectURL;
afterEach(() => {
	globalThis.fetch = originalFetch;
	URL.revokeObjectURL = originalRevoke;
	preview = Promise.resolve({ url: 'blob:test' });
	previewRequests = [];
});

test('staging deduplicates files and reconciles uploaded IDs with the server queue', () => {
	const queued: { id: number; date: Date }[] = [];
	const removed: number[] = [];
	const state = new ImporterState(() => queued, (id) => removed.push(id));
	const file = new File(['raw'], 'image.raw', { lastModified: 1000 });
	state.stage([file, file]);
	expect(uploaded).toHaveLength(1);
	expect(state.items[0].status).toBe('uploading');
	queued.push({ id: 42, date: new Date(1000) });
	callbacks.onFileUploaded!(file, 42, false);
	expect(state.items).toHaveLength(0);
	expect(state.allItems.map((item) => item.id)).toEqual([42]);
	expect(removed).toEqual([-1]);
	expect(Object.values(state.duplicateCounts)).toEqual([1]);
	state.dispose();
});

test('assignment waits for upload completion and captures the selected session', async () => {
	const state = new ImporterState(() => [], () => {});
	const file = new File(['raw'], 'pending.raw');
	state.stage([file]);
	const requests: unknown[] = [];
	globalThis.fetch = (async (_url, options) => {
		requests.push(JSON.parse(String(options?.body)));
		return Response.json({ sessionId: 7 });
	}) as typeof fetch;
	const target = { sessionId: 7 };
	const assignment = state.assign([...state.allItems], target);
	target.sessionId = 99;
	expect(state.unavailable(-1)).toBe(true);
	expect(requests).toHaveLength(0);
	callbacks.onFileUploaded!(file, 42, false);
	await assignment;
	expect(requests).toEqual([{ sessionId: 7, importIds: [42], enqueue: true }]);
	expect(state.items[0].status).toBe('assigned');
	expect(state.assigningIds.size).toBe(0);
	state.dispose();
});

test('a preview completing after disposal is revoked instead of published', async () => {
	let finish!: (value: { url: string }) => void;
	preview = new Promise((resolve) => { finish = resolve; });
	const revoked: string[] = [];
	URL.revokeObjectURL = (url) => { revoked.push(url); };
	const state = new ImporterState(() => [], () => {});
	const file = new File(['raw'], 'late.raw');
	state.stage([file]);
	for (let i = 0; i < 10; i++) await Promise.resolve();
	state.dispose();
	finish({ url: 'blob:late' });
	for (let i = 0; i < 10; i++) await Promise.resolve();
	expect(state.items[0].url).toBeUndefined();
	expect(revoked).toEqual(['blob:late']);
});

test('all thumbnails progress while upload completion is blocked', async () => {
	const state = new ImporterState(() => [], () => {});
	const files = Array.from({ length: 5 }, (_, i) => new File(['raw'], `${i}.raw`));
	state.stage(files);
	// The upload mock never reports completion; thumbnail scheduling is independent.
	for (let i = 0; i < 60; i++) await Promise.resolve();
	expect(previewRequests).toHaveLength(5);
	expect(state.items.every((item) => item.status === 'uploading')).toBe(true);
	expect(state.items.every((item) => item.url === 'blob:test')).toBe(true);
	state.dispose();
});

test('failed uploads unblock pending assignment without submitting a local ID', async () => {
	const state = new ImporterState(() => [], () => {});
	const file = new File(['raw'], 'failed.raw');
	state.stage([file]);
	let requests = 0;
	globalThis.fetch = (async () => { requests++; return Response.json({ sessionId: 7 }); }) as unknown as typeof fetch;
	const assignment = state.assign([...state.allItems], { sessionId: 7 });
	callbacks.onFileFailed!(file, new Error('Upload failed'));
	await assignment;
	expect(requests).toBe(0);
	expect(state.items).toHaveLength(0);
	expect(state.assigningIds.size).toBe(0);
	state.dispose();
});
