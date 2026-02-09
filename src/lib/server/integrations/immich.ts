import { env } from "$env/dynamic/private";
import type { Album, Image } from "../db/schema";
import type { PhotoIntegration } from "./types";

export class ImmichProvider implements PhotoIntegration {
    type = "immich";
    apiKey = env.IMMICH_API_KEY!;
    baseUrl = env.IMMICH_BASE_URL!;

    public isConfigured(): boolean {
        return !!this.apiKey && !!this.baseUrl;
    }

    public canBeConfigured(): boolean {
        return false;
    }

    public configure(): Promise<void> | never {
        throw new Error('Immich integration must be configured via environment variables.');
    }

    private headers(json = true) {
        return {
            "x-api-key": this.apiKey,
            Accept: "application/json",
            ...(json ? { "Content-Type": "application/json" } : {}),
        };
    }

    async createAlbum(title: string) {
        const res = await fetch(`${this.baseUrl}/api/albums`, {
            method: "POST",
            headers: this.headers(),
            body: JSON.stringify({ albumName: title }),
        });
        if (!res.ok) throw new Error(`Immich.createAlbum failed: ${res.status} ${await res.text()}`);
        return (await res.json()) as { id: string; url: undefined };
    }

    // Upload asset using multipart/form-data. Form field name may vary by Immich version.
    async uploadFile(fileBuffer: Uint8Array | Buffer, filename: string, image: Image): Promise<{ id: string }> {
        // Build multipart form. In Node, use FormData from undici, formdata-polyfill, or global
        // Since Node 18 has global FormData but not Blob, use Blob via global if available.
        // This example assumes global FormData and Blob exist (Node 18+).
        const form = new FormData();
        // @ts-ignore
        form.append("assetData", new Blob([fileBuffer], { type: "image/jpeg" }), filename);
        form.append("deviceAssetId", image.id.toString());
        form.append("deviceId", 'raw-editor');
        form.append("fileCreatedAt", image.recordedAt.toISOString());
        form.append("fileModifiedAt", image.updatedAt.toISOString());

        const res = await fetch(`${this.baseUrl}/api/assets`, {
            method: "POST",
            headers: {
                "x-api-key": this.apiKey,
            } as any,
            body: form as unknown as BodyInit,
        });
        if (!res.ok) throw new Error(`Immich.uploadFile failed: ${res.status} ${await res.text()}`);
        const data = await res.json();
        // Response shape varies by version; try common fields.
        const id = data?.id ?? data?.assetId ?? data?.asset?.id;
        if (!id) throw new Error(`Immich.uploadFile: cannot find asset id in response: ${JSON.stringify(data)}`);
        return { id, ...data };
    }

    async addToAlbum(album: Album, mediaIds: string[]): Promise<void> {
        // Endpoint shapes vary between versions. Common is POST /album/{id}/assets or /album/{id}/add-assets
        // Try /album/{id}/assets POST { assetIds: [...] }
        const res = await fetch(`${this.baseUrl}/api/albums/assets`, {
            method: "PUT",
            headers: this.headers(),
            body: JSON.stringify({ assetIds: mediaIds, albumIds: [album.externalId] }),
        });
        if (res.ok) return;
        // fallback to other endpoint name
        const text = await res.text().catch(() => "");
        // Try alternative endpoint
        const res2 = await fetch(`${this.baseUrl}/album/${album.id}/add-assets`, {
            method: "POST",
            headers: this.headers(),
            body: JSON.stringify({ assetIds: mediaIds }),
        });
        if (!res2.ok) throw new Error(`Immich.addToAlbum failed: ${res.status} ${text}; alt: ${res2.status} ${await res2.text()}`);
    }

    async removeFromAlbum(album: Album, mediaIds: string[]): Promise<void> {
        // Common: DELETE /album/{id}/assets with body { assetIds: [...] }
        const res = await fetch(`${this.baseUrl}/api/assets`, {
            method: "DELETE",
            headers: this.headers(),
            body: JSON.stringify({
                force: true,
                ids: mediaIds
            }),
        });
        if (res.ok) return;
        throw new Error(`Immich.removeFromAlbum failed: ${res.status} ${await res.text()}`);
    }

    async replaceInAlbum(album: Album, oldMediaId: string, fileBuffer: Uint8Array | Buffer, filename: string, image: Image): Promise<{ id: string }> {
        const uploaded = await this.uploadFile(fileBuffer, filename, image);
        const newId = uploaded.id;
        await this.addToAlbum(album, [newId]);

        try {
            await this.removeFromAlbum(album, [oldMediaId]);
        } catch (error) {
            console.warn(`[Immich] Failed to remove old asset ${oldMediaId} during replacement. It might have been deleted already. Continuing...`, error);
        }

        return uploaded;
    }

    getLinkToAlbum(album: Album): string {
        return `${this.baseUrl}/albums/${album.externalId}`;
    }
}