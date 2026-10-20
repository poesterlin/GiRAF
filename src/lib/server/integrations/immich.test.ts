import { afterEach, expect, mock, test } from 'bun:test';
import type { Album, Image } from '../db/schema';

mock.module('$env/dynamic/private', () => ({ env: {} }));
const { ImmichProvider } = await import('./immich');
const originalFetch = globalThis.fetch;
afterEach(() => {
	globalThis.fetch = originalFetch;
});
const album = { id: 42, externalId: 'external-album' } as Album;
const image = { recordedAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-02') } as Image;
function provider() {
	const result = new ImmichProvider();
	result.baseUrl = 'https://immich.example/api/';
	result.apiKey = 'test-key';
	return result;
}

test('album removal uses external album membership endpoint, never asset deletion', async () => {
	globalThis.fetch = mock(async (url, options) => {
		expect(String(url)).toBe('https://immich.example/api/albums/external-album/assets');
		expect(options?.method).toBe('DELETE');
		expect(JSON.parse(options?.body as string)).toEqual({ ids: ['old'] });
		return Response.json([{ id: 'old', success: true }]);
	}) as unknown as typeof fetch;
	await provider().removeFromAlbum(album, ['old']);
});

test('partial album failure is rejected; duplicate membership is accepted', async () => {
	globalThis.fetch = mock(async () => Response.json([{ id: 'new', success: false, error: 'no_permission' }])) as unknown as typeof fetch;
	await expect(provider().addToAlbum(album, ['new'])).rejects.toThrow('no_permission');
	globalThis.fetch = mock(async () => Response.json([{ id: 'new', success: false, error: 'duplicate' }])) as unknown as typeof fetch;
	await provider().addToAlbum(album, ['new']);
});

test('duplicate replacement does not remove the existing asset and upload uses current fields', async () => {
	const methods: string[] = [];
	globalThis.fetch = mock(async (url, options) => {
		methods.push(options!.method!);
		if (String(url).endsWith('/api/assets')) {
			const form = options!.body as FormData;
			expect(form.has('deviceId')).toBe(false);
			expect(form.has('deviceAssetId')).toBe(false);
			expect(form.get('fileCreatedAt')).toBe(image.recordedAt.toISOString());
			return Response.json({ id: 'old', status: 'duplicate' });
		}
		return Response.json([{ id: 'old', success: false, error: 'duplicate' }]);
	}) as unknown as typeof fetch;
	await provider().replaceInAlbum(album, 'old', new Uint8Array([1]), 'photo.jpg', image);
	expect(methods).toEqual(['POST', 'PUT']);
});

test('failed add never removes the previous asset', async () => {
	const methods: string[] = [];
	globalThis.fetch = mock(async (_url, options) => {
		methods.push(options!.method!);
		return options!.method === 'POST' ? Response.json({ id: 'new', status: 'created' }) : Response.json([{ id: 'new', success: false, error: 'no_permission' }]);
	}) as unknown as typeof fetch;
	await expect(provider().replaceInAlbum(album, 'old', new Uint8Array([1]), 'photo.jpg', image)).rejects.toThrow('no_permission');
	expect(methods).toEqual(['POST', 'PUT']);
});

test('authentication errors explain the configured-key problem', async () => {
	globalThis.fetch = mock(async () => Response.json({ message: 'Invalid API key' }, { status: 401 })) as unknown as typeof fetch;
	await expect(provider().createAlbum('Album')).rejects.toThrow('Check IMMICH_API_KEY');
});

test('album lookup maps fields, filters by title and sorts by recency', async () => {
	globalThis.fetch = mock(async (url, options) => {
		expect(String(url)).toBe('https://immich.example/api/albums');
		expect((options?.headers as Record<string, string>)['x-api-key']).toBe('test-key');
		return Response.json([
			{ id: 'a', albumName: 'Iceland 2026', assetCount: 12, albumThumbnailAssetId: 'cover-a', updatedAt: '2026-02-01T00:00:00Z' },
			{ id: 'b', albumName: 'Iceland 2025', assetCount: 4, albumThumbnailAssetId: null, updatedAt: '2026-03-01T00:00:00Z' },
			{ id: 'c', albumName: 'Wedding', assetCount: 9 }
		]);
	}) as unknown as typeof fetch;

	expect(await provider().listAlbums(' ICELAND ')).toEqual([
		{ id: 'b', title: 'Iceland 2025', assetCount: 4, thumbnailAssetId: null, updatedAt: '2026-03-01T00:00:00Z' },
		{ id: 'a', title: 'Iceland 2026', assetCount: 12, thumbnailAssetId: 'cover-a', updatedAt: '2026-02-01T00:00:00Z' }
	]);
});

test('album lookup rejects a response that is not an album list', async () => {
	globalThis.fetch = mock(async () => Response.json({ albums: [] })) as unknown as typeof fetch;
	await expect(provider().listAlbums()).rejects.toThrow('invalid response');
});

test('album thumbnails are fetched with the API key and streamed back', async () => {
	globalThis.fetch = mock(async (url, options) => {
		expect(String(url)).toBe('https://immich.example/api/assets/cover-a/thumbnail');
		expect((options?.headers as Record<string, string>)['x-api-key']).toBe('test-key');
		return new Response(new Uint8Array([1, 2]), { headers: { 'content-type': 'image/jpeg' } });
	}) as unknown as typeof fetch;

	const res = await provider().getAlbumThumbnail('cover-a');
	expect(res.headers.get('content-type')).toBe('image/jpeg');
	expect([...new Uint8Array(await res.arrayBuffer())]).toEqual([1, 2]);
});
