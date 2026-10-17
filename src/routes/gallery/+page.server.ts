import type { SessionsResponse } from "../api/sessions/+server";
import { libraryTags, recentlyEdited, taggedPhotos, type LibraryPhoto } from '$lib/server/library';
import type { PageServerLoad } from "./$types";

/** How many edits the sessions view previews, and how many the full contact sheet shows. */
const RECENT_STRIP = 24;
const RECENT_SHEET = 150;

export type GalleryView = { kind: 'sessions' } | { kind: 'recent' } | { kind: 'tag'; tag: string };

export const load: PageServerLoad = async ({ fetch, url }) => {
	const tag = url.searchParams.get('tag');
	const view: GalleryView = tag ? { kind: 'tag', tag } : url.searchParams.get('view') === 'recent' ? { kind: 'recent' } : { kind: 'sessions' };
	const [tags, photos, sessions] = await Promise.all([
		libraryTags(),
		view.kind === 'tag' ? taggedPhotos(view.tag) : recentlyEdited(view.kind === 'recent' ? RECENT_SHEET : RECENT_STRIP),
		// Only the sessions view lists sessions; the contact sheets skip that payload.
		view.kind === 'sessions' ? fetch('/api/sessions').then((response) => response.json() as Promise<SessionsResponse>) : Promise.resolve({ sessions: [], next: null } as SessionsResponse)
	]);
	return { ...sessions, view, tags, photos: photos as LibraryPhoto[] };
};
