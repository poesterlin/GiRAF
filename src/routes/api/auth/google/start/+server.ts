import { env } from '$env/dynamic/private';
import { redirect } from '@sveltejs/kit';

export async function GET() {
	const clientId = env.GOOGLE_CLIENT_ID;
	if (!clientId) return new Response('Missing GOOGLE_CLIENT_ID', { status: 500 });
	const redirectUri = `${env.HOST_DOMAIN || 'http://localhost:5173'}/api/auth/google/callback`;
	const scopes = ['https://www.googleapis.com/auth/photoslibrary', 'https://www.googleapis.com/auth/photoslibrary.appendonly', 'openid', 'email', 'profile'];
	const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
	url.searchParams.set('client_id', clientId);
	url.searchParams.set('redirect_uri', redirectUri);
	url.searchParams.set('response_type', 'code');
	url.searchParams.set('scope', scopes.join(' '));
	url.searchParams.set('access_type', 'offline');
	url.searchParams.set('prompt', 'consent');
	throw redirect(302, url.toString());
}
