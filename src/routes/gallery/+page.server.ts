import type { SessionsResponse } from "../api/sessions/+server";
import { archivedSessionCount, archivedSessions, libraryTags, recentlyEdited, taggedPhotos, type ArchivedSession, type LibraryPhoto } from '$lib/server/library';
import type { PageServerLoad } from "./$types";

/** How many edits the sessions view previews, and how many the full contact sheet shows. */
const RECENT_STRIP = 24;
const RECENT_SHEET = 150;

export type GalleryView = { kind: 'sessions' } | { kind: 'recent' } | { kind: 'archived' } | { kind: 'tag'; tag: string };

export const load: PageServerLoad = async ({ fetch, url }) => {
	const tag = url.searchParams.get('tag');
	const requested = url.searchParams.get('view');
	const view: GalleryView = tag ? { kind: 'tag', tag } : requested === 'recent' || requested === 'archived' ? { kind: requested } : { kind: 'sessions' };
	const [tags, archivedCount, archived, photos, sessions] = await Promise.all([
		libraryTags(),
		archivedSessionCount(),
		view.kind === 'archived' ? archivedSessions() : Promise.resolve([] as ArchivedSession[]),
		view.kind === 'tag' ? taggedPhotos(view.tag) : view.kind === 'archived' ? Promise.resolve([]) : recentlyEdited(view.kind === 'recent' ? RECENT_SHEET : RECENT_STRIP),
		// Only the sessions view lists sessions; the contact sheets skip that payload.
		view.kind === 'sessions' ? fetch('/api/sessions').then((response) => response.json() as Promise<SessionsResponse>) : Promise.resolve({ sessions: [], next: null } as SessionsResponse)
	]);
	return { ...sessions, view, tags, archivedCount, archived, photos: photos as LibraryPhoto[] };
};
