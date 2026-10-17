import type { SessionSort, SessionsResponse } from "../api/sessions/+server";
import { archivedSessionCount, archivedSessions, libraryTags, recentlyEdited, taggedPhotos, type ArchivedSession, type LibraryPhoto } from '$lib/server/library';
import type { PageServerLoad } from "./$types";

/** How many edits the sessions view previews, and how many the full contact sheet shows. */
const RECENT_STRIP = 24;
const RECENT_SHEET = 150;

export type GalleryView = { kind: 'sessions'; sessionId?: number; sort: SessionSort } | { kind: 'recent' } | { kind: 'archived' } | { kind: 'tag'; tag: string };

export const load: PageServerLoad = async ({ fetch, url, cookies }) => {
	const tag = url.searchParams.get('tag');
	const requested = url.searchParams.get('view');
	const sessionParam = Number(url.searchParams.get('session'));
	const sessionId = Number.isSafeInteger(sessionParam) && sessionParam > 0 ? sessionParam : undefined;
	// An explicit choice is remembered on this device; plain /gallery visits reuse it.
	const sortParam = url.searchParams.get('sort') ?? cookies.get('gallery-sort');
	const sort: SessionSort = sortParam === 'recorded' || sortParam === 'edit' ? sortParam : 'upload';
	if (url.searchParams.has('sort')) cookies.set('gallery-sort', sort, { path: '/', maxAge: 60 * 60 * 24 * 365, httpOnly: true, sameSite: 'lax' });
	const view: GalleryView = tag ? { kind: 'tag', tag } : requested === 'recent' || requested === 'archived' ? { kind: requested } : { kind: 'sessions', sessionId, sort };
	const sessionQuery = sessionId ? `?session=${sessionId}` : sort !== 'upload' ? `?sort=${sort}` : '';
	const [tags, archivedCount, archived, photos, sessions] = await Promise.all([
		libraryTags(),
		archivedSessionCount(),
		view.kind === 'archived' ? archivedSessions() : Promise.resolve([] as ArchivedSession[]),
		view.kind === 'tag' ? taggedPhotos(view.tag) : view.kind === 'archived' || (view.kind === 'sessions' && sessionId) ? Promise.resolve([]) : recentlyEdited(view.kind === 'recent' ? RECENT_SHEET : RECENT_STRIP),
		// Only the sessions view lists sessions; the contact sheets skip that payload.
		view.kind === 'sessions' ? fetch(`/api/sessions${sessionQuery}`).then((response) => response.json() as Promise<SessionsResponse>) : Promise.resolve({ sessions: [], next: null } as SessionsResponse)
	]);
	return {
		...sessions,
		session: sessionId && sessions.sessions[0] ? { id: sessions.sessions[0].id, name: sessions.sessions[0].name } : null,
		view,
		tags,
		archivedCount,
		archived,
		photos: photos as LibraryPhoto[]
	};
};
