import type { Album, Image } from "../db/schema";

export interface PhotoIntegration {
    type: string;
    isConfigured(): boolean;
    createAlbum(title: string): Promise<{ id: string; }>;
    uploadFile(fileBuffer: Uint8Array | Buffer, filename: string, image: Image): Promise<{ id: string }>;
    addToAlbum(album: Album, media: string[]): Promise<void>;
    removeFromAlbum(album: Album, media: string[]): Promise<void>;
    replaceInAlbum(album: Album, oldMediaId: string, fileBuffer: Uint8Array | Buffer, filename: string, image: Image): Promise<{ id: string }>;
}
