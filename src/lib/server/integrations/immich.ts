import { env } from '$env/dynamic/private';
import type { Album, Image } from '../db/schema';
import type { PhotoIntegration } from './types';

type AlbumAssetResult = { id: string; success: boolean; error?: string; errorMessage?: string };

export class ImmichProvider implements PhotoIntegration {
	type = 'immich';
	apiKey = env.IMMICH_API_KEY ?? '';
	baseUrl = env.IMMICH_BASE_URL ?? '';

	public isConfigured(): boolean {
		return !!this.apiKey && !!this.baseUrl;
	}

	public canBeConfigured(): boolean {
		return false;
	}

	public configure(): never {
		throw new Error('Immich integration must be configured via environment variables.');
	}

	private get serverUrl() {
		return this.baseUrl.replace(/\/+$/, '').replace(/\/api$/, '');
	}

	private headers(json = true) {
		return {
			'x-api-key': this.apiKey,
			Accept: 'application/json',
			...(json ? { 'Content-Type': 'application/json' } : {})
		};
	}

	private async checkResponse(res: Response, operation: string) {
		if (res.ok) return;
		const detail = await res.text();
		const hint =
			res.status === 401
				? ' Check IMMICH_API_KEY and recreate the editor container after changing it.'
				: res.status === 403
					? ' Check the Immich API key permissions and album access.'
					: '';
		throw new Error(`Immich.${operation} failed: ${res.status} ${detail}${hint}`);
	}

	async createAlbum(title: string): Promise<{ id: string; url?: string }> {
		const res = await fetch(`${this.serverUrl}/api/albums`, {
			method: 'POST',
			headers: this.headers(),
			body: JSON.stringify({ albumName: title })
		});
		await this.checkResponse(res, 'createAlbum');
		const data = (await res.json()) as { id?: string };
		if (!data.id) throw new Error('Immich.createAlbum: missing album ID');
		return { id: data.id };
	}

	async uploadFile(fileBuffer: Uint8Array | Buffer, filename: string, image: Image): Promise<{ id: string }> {
		const form = new FormData();
		form.append('assetData', new Blob([new Uint8Array(fileBuffer)], { type: 'image/jpeg' }), filename);
		form.append('fileCreatedAt', image.recordedAt.toISOString());
		form.append('fileModifiedAt', image.updatedAt.toISOString());
		const res = await fetch(`${this.serverUrl}/api/assets`, {
			method: 'POST',
			headers: this.headers(false),
			body: form
		});
		await this.checkResponse(res, 'uploadFile');
		const data = (await res.json()) as { id?: string; status?: string };
		if (!data.id || !['created', 'duplicate'].includes(data.status ?? '')) {
			throw new Error('Immich.uploadFile: invalid upload response');
		}
		return { id: data.id };
	}

	private async updateAlbumAssets(album: Album, mediaIds: string[], method: 'PUT' | 'DELETE') {
		const ids = [...new Set(mediaIds)];
		if (!ids.length) return;
		const operation = method === 'PUT' ? 'addToAlbum' : 'removeFromAlbum';
		const res = await fetch(`${this.serverUrl}/api/albums/${encodeURIComponent(album.externalId)}/assets`, {
			method,
			headers: this.headers(),
			body: JSON.stringify({ ids })
		});
		await this.checkResponse(res, operation);
		const results = (await res.json()) as AlbumAssetResult[];
		if (!Array.isArray(results) || ids.some((id) => !results.some((result) => result.id === id))) {
			throw new Error(`Immich.${operation}: incomplete album response`);
		}
		const failures = results.filter((result) => !result.success && !(method === 'PUT' && result.error === 'duplicate'));
		if (failures.length) {
			throw new Error(`Immich.${operation} failed: ${failures.map((result) => `${result.id}: ${result.errorMessage ?? result.error ?? 'unknown'}`).join(', ')}`);
		}
	}

	async addToAlbum(album: Album, mediaIds: string[]): Promise<void> {
		await this.updateAlbumAssets(album, mediaIds, 'PUT');
	}

	async removeFromAlbum(album: Album, mediaIds: string[]): Promise<void> {
		await this.updateAlbumAssets(album, mediaIds, 'DELETE');
	}

	async replaceInAlbum(album: Album, oldMediaId: string, fileBuffer: Uint8Array | Buffer, filename: string, image: Image): Promise<{ id: string }> {
		const uploaded = await this.uploadFile(fileBuffer, filename, image);
		await this.addToAlbum(album, [uploaded.id]);
		// Identical uploads return the existing asset. Do not remove it from the album.
		if (uploaded.id !== oldMediaId) await this.removeFromAlbum(album, [oldMediaId]);
		return uploaded;
	}

	getLinkToAlbum(album: Album): string {
		return `${this.serverUrl}/albums/${album.externalId}`;
	}
}
