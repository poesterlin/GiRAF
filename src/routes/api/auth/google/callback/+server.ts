import { exchangeCodeForTokens } from '$lib/server/integrations/google-token';
import { env } from '$env/dynamic/private';
import { redirect } from '@sveltejs/kit';

export async function GET({ url }: { url: URL }) {
	const code = url.searchParams.get('code');
	if (!code) return new Response('Missing code', { status: 400 });
	const redirectUri = `${env.HOST_DOMAIN || 'http://localhost:5173'}/api/auth/google/callback`;
	try {
		await exchangeCodeForTokens(code, redirectUri);
	} catch (e: any) {
		console.error('Callback token exchange failed', e);
		return new Response('Token exchange failed: ' + JSON.stringify(e), { status: 500 });
	}
	redirect(302, '/exporter');
}
