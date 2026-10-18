import { env } from '$env/dynamic/private';
import { redirect } from '@sveltejs/kit';
import { randomBytes } from 'node:crypto';
import { GOOGLE_STATE_COOKIE } from '$lib/server/integrations/google-token';
import type { RequestHandler } from './$types';

// Google retired the broad `photoslibrary` scope in 2025. These cover everything GiRAF does, all of it
// limited to the albums and photos GiRAF created.
const scopes = [
	'https://www.googleapis.com/auth/photoslibrary.appendonly',
	'https://www.googleapis.com/auth/photoslibrary.readonly.appcreateddata',
	'https://www.googleapis.com/auth/photoslibrary.edit.appcreateddata',
	'openid',
	'email',
	'profile'
];

export const GET: RequestHandler = async ({ cookies, url: requestUrl }) => {
	const clientId = env.GOOGLE_CLIENT_ID;
	if (!clientId) return new Response('Missing GOOGLE_CLIENT_ID', { status: 500 });
	// A random state tied to this browser stops another site from linking its own Google account here
	const state = randomBytes(32).toString('hex');
	cookies.set(GOOGLE_STATE_COOKIE, state, { path: '/api/auth/google', httpOnly: true, sameSite: 'lax', secure: requestUrl.protocol === 'https:', maxAge: 600 });
	const redirectUri = `${env.HOST_DOMAIN || 'http://localhost:5173'}/api/auth/google/callback`;
	const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
	url.searchParams.set('client_id', clientId);
	url.searchParams.set('redirect_uri', redirectUri);
	url.searchParams.set('response_type', 'code');
	url.searchParams.set('scope', scopes.join(' '));
	url.searchParams.set('access_type', 'offline');
	url.searchParams.set('prompt', 'consent');
	url.searchParams.set('state', state);
	redirect(302, url.toString());
};
