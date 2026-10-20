import type { Album, Image } from '../db/schema';

/** An album that already exists on an external service. */
export type ExternalAlbum = {
	id: string;
	title: string;
	assetCount: number;
	/** Asset that represents the album cover, when the service exposes one. */
	thumbnailAssetId: string | null;
	updatedAt: string | null;
};

export interface PhotoIntegration {
	type: string;
	isConfigured(): boolean;
	canBeConfigured(): boolean;
	configure(): void | never;
	createAlbum(title: string): Promise<{ id: string; url?: string }>;
	/** Services that let an API list the user's albums implement this to allow linking an existing one. */
	listAlbums?(query?: string): Promise<ExternalAlbum[]>;
	/** Fetches the small cover image for an asset, used by the album lookup UI. */
	getAlbumThumbnail?(assetId: string): Promise<Response>;
	uploadFile(fileBuffer: Uint8Array | Buffer, filename: string, image: Image): Promise<{ id: string }>;
	addToAlbum(album: Album, media: string[]): Promise<void>;
	removeFromAlbum(album: Album, media: string[]): Promise<void>;
	replaceInAlbum(album: Album, oldMediaId: string, fileBuffer: Uint8Array | Buffer, filename: string, image: Image): Promise<{ id: string }>;
	getLinkToAlbum(album: Album): string;
}
