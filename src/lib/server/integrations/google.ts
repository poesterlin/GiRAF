import { env } from "$env/dynamic/private";
import { assert } from "$lib";
import type { Album, Image, Media } from "../db/schema";
import { getAlbumByExternalId, getMediaByExternalIds, storeAlbum, storeMedia } from "./db";
import type { PhotoIntegration } from "./types";

const GOOGLE_API_BASE = "https://photoslibrary.googleapis.com/v1";

export class GooglePhotosProvider implements PhotoIntegration {
    type = "google";
    accessToken = env.GOOGLE_PHOTOS_ACCESS_TOKEN!;

    public isConfigured(): boolean {
        return !!this.accessToken;
    }

    private headers(json = true) {
        return {
            Authorization: `Bearer ${this.accessToken}`,
            ...(json ? { "Content-Type": "application/json" } : {}),
        };
    }

    async createAlbum(title: string): Promise<{ id: string; }> {
        const res = await fetch(`${GOOGLE_API_BASE}/albums`, {
            method: "POST",
            headers: this.headers(),
            body: JSON.stringify({ album: { title } }),
        });
        if (!res.ok) throw new Error(`Google.createAlbum failed: ${res.status} ${await res.text()}`);
        const album = await res.json();
        assert(album?.id, "Google.createAlbum: no album id in response");

        return album as { id: string; };
    }

    private async uploadBytesGetToken(fileBuffer: Uint8Array | Buffer, filename: string, mime: string): Promise<string> {
        const res = await fetch(`${GOOGLE_API_BASE}/uploads`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${this.accessToken}`,
                "Content-type": mime,
                "X-Goog-Upload-File-Name": filename,
                "X-Goog-Upload-Protocol": "raw",
            },
            // @ts-ignore - fetch in Node 18+ supports Buffer
            body: fileBuffer,
        });
        if (!res.ok) throw new Error(`Google.upload failed: ${res.status} ${await res.text()}`);
        return (await res.text()).trim();
    }

    async uploadFile(fileBuffer: Uint8Array | Buffer, filename: string, image: Image): Promise<{ id: string }> {
        const uploadToken = await this.uploadBytesGetToken(fileBuffer, filename, "image/jpeg");
        const res = await fetch(`${GOOGLE_API_BASE}/mediaItems:batchCreate`, {
            method: "POST",
            headers: this.headers(),
            body: JSON.stringify({
                newMediaItems: [{ description: "", simpleMediaItem: { uploadToken } }],
            }),
        });
        if (!res.ok) throw new Error(`Google.createMediaItem failed: ${res.status} ${await res.text()}`);
        const data = await res.json();
        const r = data.newMediaItemResults?.[0];
        if (!r || r.status?.code !== 0 || !r.mediaItem) throw new Error(`Google.createMediaItem failed: ${JSON.stringify(r)}`);


        return r.mediaItem as { id: string };
    }

    async addToAlbum(album: Album, mediaIds: string[]): Promise<void> {
        const res = await fetch(`${GOOGLE_API_BASE}/albums/${album.externalId}:batchAddMediaItems`, {
            method: "POST",
            headers: this.headers(),
            body: JSON.stringify({ mediaItemIds: mediaIds }),
        });
        if (!res.ok) throw new Error(`Google.addToAlbum failed: ${res.status} ${await res.text()}`);
    }

    async removeFromAlbum(album: Album, mediaIds: string[]): Promise<void> {
        const res = await fetch(`${GOOGLE_API_BASE}/albums/${album.externalId}:batchRemoveMediaItems`, {
            method: "POST",
            headers: this.headers(),
            body: JSON.stringify({ mediaItemIds: mediaIds }),
        });
        if (!res.ok) throw new Error(`Google.removeFromAlbum failed: ${res.status} ${await res.text()}`);
    }

    async replaceInAlbum(album: Album, oldMediaId: string, fileBuffer: Uint8Array | Buffer, filename: string, image: Image): Promise<{ id: string }> {
        // Upload new file and create into album (note: batchCreate supports albumId)
        const uploadToken = await this.uploadBytesGetToken(fileBuffer, filename, "image/jpeg");
        const res = await fetch(`${GOOGLE_API_BASE}/mediaItems:batchCreate`, {
            method: "POST",
            headers: this.headers(),
            body: JSON.stringify({
                albumId: album.externalId,
                newMediaItems: [{ description: "", simpleMediaItem: { uploadToken } }],
            }),
        });
        if (!res.ok) throw new Error(`Google.replaceInAlbum create failed: ${res.status} ${await res.text()}`);
        const data = await res.json();
        const r = data.newMediaItemResults?.[0];
        if (!r || r.status?.code !== 0 || !r.mediaItem) throw new Error(`Google.replaceInAlbum create failed: ${JSON.stringify(r)}`);
        const newMedia = r.mediaItem;
        
        return newMedia as { id: string };
    }
}