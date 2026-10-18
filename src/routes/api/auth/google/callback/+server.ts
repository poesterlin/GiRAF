import { GOOGLE_STATE_COOKIE, exchangeCodeForTokens } from '$lib/server/integrations/google-token';
import { env } from '$env/dynamic/private';
import { redirect } from '@sveltejs/kit';
import { timingSafeEqual } from 'node:crypto';
import type { RequestHandler } from './$types';

function sameState(expected: string | undefined, actual: string | null): boolean {
	if (!expected || !actual || expected.length !== actual.length) return false;
	return timingSafeEqual(Buffer.from(expected), Buffer.from(actual));
}

export const GET: RequestHandler = async ({ url, cookies }) => {
	const expectedState = cookies.get(GOOGLE_STATE_COOKIE);
	cookies.delete(GOOGLE_STATE_COOKIE, { path: '/api/auth/google' });
	if (!sameState(expectedState, url.searchParams.get('state'))) return new Response('Invalid or expired sign-in attempt. Start the Google sign-in again.', { status: 400 });

	const code = url.searchParams.get('code');
	if (!code) return new Response('Missing code', { status: 400 });
	const redirectUri = `${env.HOST_DOMAIN || 'http://localhost:5173'}/api/auth/google/callback`;
	try {
		await exchangeCodeForTokens(code, redirectUri);
	} catch (e) {
		console.error('Callback token exchange failed', e);
		return new Response('Token exchange failed. See the server log for details.', { status: 500 });
	}
	redirect(302, '/exporter');
};
