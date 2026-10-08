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
