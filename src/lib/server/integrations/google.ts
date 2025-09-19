import { assert } from '$lib';
import type { Album, Image } from '../db/schema';
import type { PhotoIntegration } from './types';
import { refreshAccessTokenIfNeeded, hasRefreshToken } from './google-token';
import { redirect } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';

const GOOGLE_API_BASE = 'https://photoslibrary.googleapis.com/v1';

function truncate(s: string | undefined | null, max = 500) {
	if (!s) return '';
	return s.length > max ? s.slice(0, max) + '... (truncated)' : s;
}
function methodOrUrlForLog(method: string | undefined, url: string) {
	return `${method ?? 'GET'} ${url}`;
}

function maskHeadersForLog(headers: Record<string, string> | undefined): string {
	if (!headers) return '<none>';
	try {
		return Object.entries(headers)
			.map(([k, v]) => {
				if (!v) return `${k}:<empty>`;
				const lower = k.toLowerCase();
				if (lower === 'authorization') {
					const scheme = v.split(' ')[0] ?? 'Bearer';
					return `${k}: ${scheme} <redacted len=${v.length}>`;
				}
				return `${k}: ${truncate(v, 200)}`;
			})
			.join(', ');
	} catch (_) {
		return '<unserializable headers>';
	}
}

class Semaphore {
	private max: number;
	private count: number;
	private waiters: Array<() => void>;
	constructor(max: number) {
		this.max = Math.max(1, max);
		this.count = 0;
		this.waiters = [];
	}
	async acquire(): Promise<void> {
		if (this.count < this.max) {
			this.count++;
			return;
		}
		await new Promise<void>((resolve) => this.waiters.push(resolve));
		this.count++;
	}
	release(): void {
		this.count = Math.max(0, this.count - 1);
		const next = this.waiters.shift();
		if (next) next();
	}
}

const DEFAULT_MAX_CONCURRENT_WRITES = Number(env.GOOGLE_MAX_CONCURRENT_WRITES) || 3;
const DEFAULT_CREATE_BATCH_SIZE = Number(env.GOOGLE_CREATE_MAX_BATCH_SIZE) || 10;
const DEFAULT_CREATE_BATCH_WAIT_MS = Number(env.GOOGLE_CREATE_MAX_WAIT_MS) || 150;
const DEFAULT_ADD_BATCH_SIZE = Number(env.GOOGLE_ADD_MAX_BATCH_SIZE) || 20;
const DEFAULT_ADD_BATCH_WAIT_MS = Number(env.GOOGLE_ADD_MAX_WAIT_MS) || 150;

// Batcher that groups uploadTokens into a single mediaItems:batchCreate call
class CreateBatcher {
	private fetchWithRetry: (url: string, init?: any) => Promise<Response>;
	private headersFn: (json?: boolean) => Promise<Record<string, string>>;
	private maxSize: number;
	private waitMs: number;
	private queues: Map<string, { items: Array<any>; timer?: any }> = new Map();

	constructor(
		fetchWithRetry: (url: string, init?: any) => Promise<Response>,
		headersFn: (json?: boolean) => Promise<Record<string, string>>,
		maxSize = DEFAULT_CREATE_BATCH_SIZE,
		waitMs = DEFAULT_CREATE_BATCH_WAIT_MS
	) {
		this.fetchWithRetry = fetchWithRetry;
		this.headersFn = headersFn;
		this.maxSize = maxSize;
		this.waitMs = waitMs;
	}

	enqueue(uploadToken: string, filename: string, albumId?: string): Promise<{ id: string }> {
		const key = albumId ?? '__NOALBUM__';
		let q = this.queues.get(key);
		if (!q) {
			q = { items: [] };
			this.queues.set(key, q);
		}

		return new Promise((resolve, reject) => {
			q!.items.push({ uploadToken, filename, resolve, reject });
			if (q!.items.length >= this.maxSize) {
				this.flushKey(key);
				return;
			}
			if (!q!.timer) {
				q!.timer = setTimeout(() => this.flushKey(key), this.waitMs);
			}
		});
	}

	private async flushKey(key: string) {
		const q = this.queues.get(key);
		if (!q || q.items.length === 0) return;
		if (q.timer) {
			clearTimeout(q.timer);
			q.timer = undefined;
		}
		const items = q.items.splice(0);
		if (q.items.length === 0) this.queues.delete(key);

		const albumId = key === '__NOALBUM__' ? undefined : key;
		const body: any = {
			newMediaItems: items.map((it: any) => ({ description: '', simpleMediaItem: { uploadToken: it.uploadToken } }))
		};
		if (albumId) body.albumId = albumId;

		try {
			const res = await this.fetchWithRetry(`${GOOGLE_API_BASE}/mediaItems:batchCreate`, {
				method: 'POST',
				headers: async () => await this.headersFn(),
				body: JSON.stringify(body),
				write: true,
				maxAttempts: 6
			});
			if (!res.ok) {
				const text = await res.text().catch(() => '<no body>');
				console.warn(
					`Google.createMediaItem batch failed ${res.status} ${res.statusText}; album=${albumId ?? '<none>'}; items=[${items.map((i: any) => i.filename).join(', ')}]; response=${truncate(text, 1000)}`
				);
				const err = new Error(`Google.createMediaItem batch failed: ${res.status} ${text}`);
				items.forEach((it: any) => it.reject(err));
				return;
			}

			const data = await res.json().catch(() => ({}));
			let results: any[] = [];
			if (Array.isArray(data.newMediaItemResults)) results = data.newMediaItemResults;
			else if (data.newMediaItemResult) results = [data.newMediaItemResult];
			else if (data.mediaItem) results = [{ mediaItem: data.mediaItem, status: { code: 0 } }];

			for (let i = 0; i < items.length; i++) {
				const it = items[i];
				const r = results[i];
				if (!r) {
					it.reject(new Error(`Google.createMediaItem: missing result for item ${i}`));
					continue;
				}
				const statusCode = r?.status?.code;
				const statusMessage = (r?.status?.message || '').toString().toLowerCase();
				const hasMediaItem = !!r?.mediaItem;
				const ok = hasMediaItem && (statusCode === 0 || statusMessage.includes('success') || !r?.status);
				if (!ok) {
					it.reject(new Error(`Google.createMediaItem failed for ${it.filename}: ${JSON.stringify(r ?? data)}`));
					continue;
				}
				const mediaItem = r.mediaItem ?? r;
				if (!mediaItem?.id) {
					it.reject(new Error(`Google.createMediaItem: no media id in response for ${it.filename}`));
					continue;
				}
				it.resolve({ id: mediaItem.id });
			}
		} catch (e: any) {
			items.forEach((it: any) => it.reject(e));
		}
	}
}

// Batcher for adding media items to albums. Groups many adds into one request per album.
class AddToAlbumBatcher {
	private fetchWithRetry: (url: string, init?: any) => Promise<Response>;
	private headersFn: (json?: boolean) => Promise<Record<string, string>>;
	private maxSize: number;
	private waitMs: number;
	private queues: Map<string, { mediaSet: Set<string>; waiters: Array<{ resolve: () => void; reject: (err: any) => void }>; timer?: any }> = new Map();

	constructor(
		fetchWithRetry: (url: string, init?: any) => Promise<Response>,
		headersFn: (json?: boolean) => Promise<Record<string, string>>,
		maxSize = DEFAULT_ADD_BATCH_SIZE,
		waitMs = DEFAULT_ADD_BATCH_WAIT_MS
	) {
		this.fetchWithRetry = fetchWithRetry;
		this.headersFn = headersFn;
		this.maxSize = maxSize;
		this.waitMs = waitMs;
	}

	enqueue(albumId: string, mediaIds: string[]): Promise<void> {
		let q = this.queues.get(albumId);
		if (!q) {
			q = { mediaSet: new Set(), waiters: [] };
			this.queues.set(albumId, q);
		}
		for (const id of mediaIds) q.mediaSet.add(id);
		return new Promise((resolve, reject) => {
			q!.waiters.push({ resolve, reject });
			if (q!.mediaSet.size >= this.maxSize) {
				this.flushAlbum(albumId);
				return;
			}
			if (!q!.timer) {
				q!.timer = setTimeout(() => this.flushAlbum(albumId), this.waitMs);
			}
		});
	}

	private async flushAlbum(albumId: string) {
		const q = this.queues.get(albumId);
		if (!q || q.mediaSet.size === 0) return;
		if (q.timer) {
			clearTimeout(q.timer);
			q.timer = undefined;
		}
		const ids = Array.from(q.mediaSet);
		q.mediaSet.clear();
		this.queues.delete(albumId);
		try {
			const res = await this.fetchWithRetry(`${GOOGLE_API_BASE}/albums/${albumId}:batchAddMediaItems`, {
				method: 'POST',
				headers: async () => await this.headersFn(),
				body: JSON.stringify({ mediaItemIds: ids }),
				write: true,
				maxAttempts: 6
			});
			if (!res.ok) {
				const text = await res.text().catch(() => '');
				console.warn(`Google.addToAlbum batch failed ${res.status} ${res.statusText}; album=${albumId}; items=[${ids.join(', ')}]; response=${truncate(text, 1000)}`);
				const err = new Error(`Google.addToAlbum batch failed: ${res.status} ${text}`);
				q.waiters.forEach((w) => w.reject(err));
				return;
			}
			q.waiters.forEach((w) => w.resolve());
		} catch (e: any) {
			q.waiters.forEach((w) => w.reject(e));
		}
	}
}

export class GooglePhotosProvider implements PhotoIntegration {
	type = 'google';	
	private writeSemaphore = new Semaphore(DEFAULT_MAX_CONCURRENT_WRITES);
	private createBatcher: CreateBatcher;
	private addBatcher: AddToAlbumBatcher;

	constructor() {
		// Bind helper functions into batchers so they can call the provider's retry logic and header refresh.
		this.createBatcher = new CreateBatcher(this.fetchWithRetry.bind(this), this.headers.bind(this), DEFAULT_CREATE_BATCH_SIZE, DEFAULT_CREATE_BATCH_WAIT_MS);
		this.addBatcher = new AddToAlbumBatcher(this.fetchWithRetry.bind(this), this.headers.bind(this), DEFAULT_ADD_BATCH_SIZE, DEFAULT_ADD_BATCH_WAIT_MS);
	}

	public isConfigured(): boolean {
		// Support either an env access token (legacy) or the file-backed refresh token flow
		return hasRefreshToken();
	}

	public canBeConfigured(): boolean {
		return !!env.GOOGLE_CLIENT_ID && !!env.GOOGLE_CLIENT_SECRET;
	}

	public async configure(): Promise<void> {
		throw redirect(302, '/api/auth/google/start');
	}

	private async headers(json = true) {
		const token = await refreshAccessTokenIfNeeded();
		// Log presence/length of token but never print the token itself
		try {
			console.debug(`Google.headers: haveToken=${!!token} tokenLen=${typeof token === 'string' ? token.length : 0}`);
		} catch (_) {}
		return {
			Authorization: `Bearer ${token}`,
			...(json ? { 'Content-Type': 'application/json' } : {})
		};
	}

	// Generic fetch wrapper with retries, backoff and optional write-concurrency throttling.
	async fetchWithRetry(
		url: string,
		init: {
			method?: string;
			headers?: Record<string, string> | (() => Promise<Record<string, string>>);
			body?: any;
			maxAttempts?: number;
			write?: boolean;
		} = {}
	): Promise<Response> {
		const maxAttempts = init.maxAttempts ?? 5;
		let attempt = 0;
		while (true) {
			attempt++;
			if (init.write) {
				await this.writeSemaphore.acquire();
			}
			try {
				const headers = typeof init.headers === 'function' ? await init.headers() : (init.headers ?? {});
				const maskedHeaders = maskHeadersForLog(headers as Record<string, string> | undefined);
				const res = await fetch(url, {
					method: init.method ?? 'GET',
					headers: headers as Record<string, string>,
					body: init.body
				});

				if (res.ok) return res;

				// Retry on 429 (rate limit) and 5xx responses
				const status = res.status;
				const retryable = status === 429 || (status >= 500 && status < 600);
				if (retryable && attempt < maxAttempts) {
					// Try to honor Retry-After header
					const retryAfter = res.headers.get('retry-after');
					let waitMs = 0;
					if (retryAfter) {
						const parsed = parseInt(retryAfter, 10);
						if (!isNaN(parsed)) {
							waitMs = parsed * 1000;
						}
					}
					if (!waitMs) {
						// exponential backoff with jitter
						const base = 250;
						const exp = Math.min(10000, base * Math.pow(2, attempt - 1));
						const jitter = Math.floor(Math.random() * base);
						waitMs = exp + jitter;
					}
					const bodyText = await res.text().catch(() => '<unable to read body>');
					console.warn(
						`Google API ${methodOrUrlForLog(init.method, url)} failed with ${status}; attempt ${attempt}/${maxAttempts}. Retrying in ${waitMs}ms. RequestHeaders=${maskedHeaders}; ResponseBody=${truncate(bodyText, 1000)}`
					);
					await new Promise((r) => setTimeout(r, waitMs));
					continue;
				}

				// Not retrying (either final attempt or non-retryable). Log details using a clone so we don't consume the original body stream.
				try {
					const cloneBody = await res
						.clone()
						.text()
						.catch(() => '<unable to read body>');
					const respHeaders = Array.from(res.headers.entries())
						.map(([k, v]) => `${k}: ${truncate(v, 200)}`)
						.join(', ');
					console.warn(
						`Google API ${methodOrUrlForLog(init.method, url)} returned ${status} ${res.statusText}; attempt ${attempt}/${maxAttempts}; requestHeaders=[${maskedHeaders}]; responseHeaders=[${respHeaders}]; responseBody=${truncate(cloneBody, 1000)}`
					);
				} catch (_) {
					console.warn(`Google API ${methodOrUrlForLog(init.method, url)} returned ${status} ${res.statusText}; attempt ${attempt}/${maxAttempts}; (failed to read clone)`);
				}
				return res;
			} finally {
				if (init.write) {
					try {
						this.writeSemaphore.release();
					} catch (_) {}
				}
			}
		}
	}

	async createAlbum(title: string): Promise<{ id: string }> {
		const res = await this.fetchWithRetry(`${GOOGLE_API_BASE}/albums`, {
			method: 'POST',
			headers: async () => await this.headers(),
			body: JSON.stringify({ album: { title } }),
			write: true,
			maxAttempts: 5
		});
		if (!res.ok) throw new Error(`Google.createAlbum failed: ${res.status} ${await res.text()}`);
		const album = await res.json();
		assert(album?.id, 'Google.createAlbum: no album id in response');
		return album as { id: string };
	}

	private async uploadBytesGetToken(fileBuffer: Uint8Array | Buffer, filename: string, mime: string): Promise<string> {
		const res = await this.fetchWithRetry(`${GOOGLE_API_BASE}/uploads`, {
			method: 'POST',
			headers: async () => ({ ...(await this.headers(false)), 'Content-type': mime, 'X-Goog-Upload-File-Name': filename, 'X-Goog-Upload-Protocol': 'raw' }),
			body: fileBuffer,
			write: true,
			maxAttempts: 6
		});
		if (!res.ok) throw new Error(`Google.upload failed: ${res.status} ${await res.text()}`);
		return (await res.text()).trim();
	}

	async uploadFile(fileBuffer: Uint8Array | Buffer, filename: string, image: Image): Promise<{ id: string }> {
		const uploadToken = await this.uploadBytesGetToken(fileBuffer, filename, 'image/jpeg');
		// enqueue token for batched create (no album)
		return await this.createBatcher.enqueue(uploadToken, filename, undefined);
	}

	async addToAlbum(album: Album, mediaIds: string[]): Promise<void> {
		return await this.addBatcher.enqueue(album.externalId, mediaIds);
	}

	async removeFromAlbum(album: Album, mediaIds: string[]): Promise<void> {
		const res = await this.fetchWithRetry(`${GOOGLE_API_BASE}/albums/${album.externalId}:batchRemoveMediaItems`, {
			method: 'POST',
			headers: async () => await this.headers(),
			body: JSON.stringify({ mediaItemIds: mediaIds }),
			write: true,
			maxAttempts: 5
		});
		if (!res.ok) throw new Error(`Google.removeFromAlbum failed: ${res.status} ${await res.text()}`);
	}

	// Helper: check whether a given mediaId is present in an album (pages through results)
	// Returns: true = present, false = not present, null = could not determine (error)
	private async isMediaInAlbum(albumId: string, mediaId: string): Promise<boolean | null> {
		let pageToken: string | undefined = undefined;
		const pageSize = 100;
		do {
			const body: any = { albumId, pageSize };
			if (pageToken) body.pageToken = pageToken;
			const res = await this.fetchWithRetry(`${GOOGLE_API_BASE}/mediaItems:search`, {
				method: 'POST',
				headers: async () => await this.headers(),
				body: JSON.stringify(body),
				maxAttempts: 3
			});
			if (!res.ok) {
				// If we cannot query album contents, return null (unknown) so callers can try removal rather than assuming absence.
				const responseText = await res.text().catch(() => '<no body>');
				const respHeaders = Array.from(res.headers.entries())
					.map(([k, v]) => `${k}: ${truncate(v, 200)}`)
					.join(', ');
				const reqBodyTrunc = truncate(JSON.stringify(body), 2000);
				console.warn(
					`Google.isMediaInAlbum: mediaItems.search failed ${res.status} ${res.statusText}; request=${methodOrUrlForLog('POST', `${GOOGLE_API_BASE}/mediaItems:search`)}; album=${albumId}; mediaId=${mediaId}; pageToken=${pageToken ?? '<none>'}; requestBody=${reqBodyTrunc}; responseHeaders=[${respHeaders}]; responseBody=${truncate(responseText, 2000)}`
				);
				try {
					const parsed = JSON.parse(responseText);
					if (parsed && parsed.error) {
						console.warn('Google.isMediaInAlbum: parsed error:', truncate(JSON.stringify(parsed.error), 2000));
					}
				} catch (_) {
					// ignore non-JSON
				}
				if (res.status === 403) {
					console.warn(
						'Google.isMediaInAlbum: 403 Forbidden - token may lack required scopes (photoslibrary.readonly/photoslibrary) or album is not accessible by the token owner. Ensure the account and scopes are correct.'
					);
				}
				return null;
			}
			const data = await res.json().catch(() => ({}));
			const items = data.mediaItems ?? [];
			// Helpful debug: log how many items were returned on each page
			if (items.length > 0) {
				console.debug(`Google.isMediaInAlbum: got ${items.length} mediaItems for album=${albumId}${pageToken ? ` pageToken=${pageToken}` : ''}`);
			}
			for (const it of items) {
				if (it?.id === mediaId) return true;
			}
			pageToken = data.nextPageToken;
		} while (pageToken);
		return false;
	}

	// Ensure old media is removed from album; retries a few times with backoff.
	private async ensureRemovedFromAlbum(albumId: string, oldMediaId: string): Promise<boolean> {
		const maxAttempts = 6;
		for (let attempt = 0; attempt < maxAttempts; attempt++) {
			try {
				// Check presence; if we can confirm it's absent, we're done
				const present = await this.isMediaInAlbum(albumId, oldMediaId);
				if (present === false) return true;

				// If present is true or unknown (null), attempt to remove anyway
				const rem = await this.fetchWithRetry(`${GOOGLE_API_BASE}/albums/${albumId}:batchRemoveMediaItems`, {
					method: 'POST',
					headers: async () => await this.headers(),
					body: JSON.stringify({ mediaItemIds: [oldMediaId] }),
					write: true,
					maxAttempts: 6
				});
				if (rem.ok) {
					// small delay then re-check
					await new Promise((r) => setTimeout(r, 250));
					const still = await this.isMediaInAlbum(albumId, oldMediaId);
					if (still === false) return true;
					// If we cannot determine after a successful remove, assume success
					if (still === null) return true;
				} else {
					const text = await rem.text().catch(() => '<no body>');
					const respHeaders = Array.from(rem.headers.entries())
						.map(([k, v]) => `${k}: ${truncate(v, 200)}`)
						.join(', ');
					console.warn(
						`Google.ensureRemovedFromAlbum: remove returned ${rem.status} ${rem.statusText}; album=${albumId}; mediaId=${oldMediaId}; responseHeaders=[${respHeaders}]; responseBody=${truncate(text, 1000)}`
					);
				}
			} catch (e: any) {
				console.warn(`Google.ensureRemovedFromAlbum: attempt ${attempt + 1} failed:`, e?.message ?? e);
			}

			// backoff
			const wait = Math.min(5000, 200 * Math.pow(2, attempt));
			await new Promise((r) => setTimeout(r, wait));
		}
		return false;
	}

	async replaceInAlbum(album: Album, oldMediaId: string, fileBuffer: Uint8Array | Buffer, filename: string, image: Image): Promise<{ id: string }> {
		// Sanity-check album exists and is accessible before attempting a create-with-album
		try {
			const albumRes = await this.fetchWithRetry(`${GOOGLE_API_BASE}/albums/${album.externalId}`, {
				method: 'GET',
				headers: async () => await this.headers(),
				maxAttempts: 2
			});
			if (!albumRes.ok) {
				const txt = await albumRes.text().catch(() => '<no body>');
				console.warn(`Google.replaceInAlbum: album fetch failed ${album.externalId} -> ${albumRes.status} ${albumRes.statusText}; response=${truncate(txt, 1000)}`);
				if (albumRes.status === 404) {
					throw new Error(`Google.replaceInAlbum: album not found: ${album.externalId}`);
				}
				if (albumRes.status === 403) {
					throw new Error(`Google.replaceInAlbum: album inaccessible (403) - token may lack scopes or album owned by another account`);
				}
				throw new Error(`Google.replaceInAlbum: album check failed: ${albumRes.status} ${txt}`);
			}
		} catch (err) {
			// surface more context
			if ((err as any)?.message?.includes('album not found')) throw err;
			// @ts-ignore
			console.warn('Google.replaceInAlbum: album existence check failed with error:', err?.message ?? err);
			// proceed — we'll let the create call fail with its own error which we log below
		}

		// Upload token
		const uploadToken = await this.uploadBytesGetToken(fileBuffer, filename, 'image/jpeg');

		// Create the new media item into the album (immediate call so ordering is deterministic)
		const res = await this.fetchWithRetry(`${GOOGLE_API_BASE}/mediaItems:batchCreate`, {
			method: 'POST',
			headers: async () => await this.headers(),
			body: JSON.stringify({ albumId: album.externalId, newMediaItems: [{ description: '', simpleMediaItem: { uploadToken } }] }),
			write: true,
			maxAttempts: 6
		});
		if (!res.ok) {
			const body = await res.text().catch(() => '<no body>');
			const respHeaders = Array.from(res.headers.entries())
				.map(([k, v]) => `${k}: ${truncate(v, 200)}`)
				.join(', ');
			console.warn(
				`Google.replaceInAlbum create failed ${res.status} ${res.statusText}; album=${album.externalId}; filename=${filename}; responseHeaders=[${respHeaders}]; response=${truncate(body, 1000)}`
			);
			if (res.status === 404) {
				// Common real-world cause: album.externalId is stale or belongs to another account
				throw new Error(`Google.replaceInAlbum: album not found: ${res.status} ${body}`);
			}
			if (res.status === 403) {
				throw new Error(`Google.replaceInAlbum: forbidden when creating media: ${res.status} ${body}`);
			}
			throw new Error(`Google.replaceInAlbum create failed: ${res.status} ${body}`);
		}
		const data = await res.json().catch(() => ({}));
		let r: any = null;
		if (Array.isArray(data.newMediaItemResults)) r = data.newMediaItemResults[0];
		else if (data.newMediaItemResult) r = data.newMediaItemResult;
		else r = data;

		const statusCode = r?.status?.code;
		const statusMessage = (r?.status?.message || '').toString().toLowerCase();
		const hasMediaItem = !!r?.mediaItem;
		const ok = hasMediaItem && (statusCode === 0 || statusMessage.includes('success') || !r?.status);
		if (!ok) {
			console.warn('Google.replaceInAlbum: unexpected create response:', truncate(JSON.stringify(r ?? data), 2000));
			throw new Error(`Google.replaceInAlbum create failed: ${JSON.stringify(r ?? data)}`);
		}
		const newMedia = r.mediaItem ?? data.mediaItem;
		assert(newMedia?.id, 'Google.replaceInAlbum: no media id in response');
		const newId = newMedia.id;

		console.debug(`Google.replaceInAlbum: created new media ${newId} for album=${album.externalId} (old=${oldMediaId})`);

		// Try to remove the old media from album robustly
		const removed = await this.ensureRemovedFromAlbum(album.externalId, oldMediaId);
		if (!removed) {
			console.warn(`Google.replaceInAlbum: unable to confirm removal of old media ${oldMediaId} from album ${album.externalId}`);
		} else {
			console.debug(`Google.replaceInAlbum: confirmed removal of old media ${oldMediaId} from album ${album.externalId}`);
		}

		return { id: newId };
	}
}
