import { env } from '$env/dynamic/private';
import fs from 'fs';
import path from 'path';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const TOKEN_FILE = path.join(DATA_DIR, 'google_tokens.json');

export type StoredTokens = {
	access_token?: string;
	refresh_token?: string;
	expires_at?: number; // epoch ms
};

function ensureDataDir() {
	if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

export function readTokens(): StoredTokens {
	ensureDataDir();
	try {
		if (!fs.existsSync(TOKEN_FILE)) return {};
		const raw = fs.readFileSync(TOKEN_FILE, 'utf8');
		return JSON.parse(raw) as StoredTokens;
	} catch (e) {
		console.error('Failed to read google token file', e);
		return {};
	}
}

export function writeTokens(t: StoredTokens) {
	ensureDataDir();
	fs.writeFileSync(TOKEN_FILE, JSON.stringify(t, null, 2), 'utf8');
}

export async function exchangeCodeForTokens(code: string, redirect_uri: string) {
	const params = new URLSearchParams({
		code,
		client_id: env.GOOGLE_CLIENT_ID!,
		client_secret: env.GOOGLE_CLIENT_SECRET!,
		redirect_uri,
		grant_type: 'authorization_code'
	});

	const res = await fetch('https://oauth2.googleapis.com/token', {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: params.toString()
	});
	if (!res.ok) throw new Error(`token exchange failed: ${res.status} ${await res.text()}`);
	const data = await res.json();
	const now = Date.now();
	const tokens: StoredTokens = {
		access_token: data.access_token,
		refresh_token: data.refresh_token,
		expires_at: now + (data.expires_in || 3600) * 1000
	};
	writeTokens(tokens);
	return tokens;
}

export async function refreshAccessTokenIfNeeded() {
	const tokens = readTokens();
	if (!tokens.refresh_token) throw new Error('No refresh token available');
	const now = Date.now();
	// refresh if missing access_token or expires within 1 minute
	if (tokens.access_token && tokens.expires_at && tokens.expires_at - now > 60_000) {
		return tokens.access_token;
	}

	const params = new URLSearchParams({
		client_id: env.GOOGLE_CLIENT_ID!,
		client_secret: env.GOOGLE_CLIENT_SECRET!,
		refresh_token: tokens.refresh_token,
		grant_type: 'refresh_token'
	});
	const res = await fetch('https://oauth2.googleapis.com/token', {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: params.toString()
	});
	if (!res.ok) {
		const txt = await res.text().catch(() => '');
		throw new Error(`refresh token failed: ${res.status} ${txt}`);
	}
	const data = await res.json();
	tokens.access_token = data.access_token;
	if (data.expires_in) tokens.expires_at = Date.now() + data.expires_in * 1000;
	// Google may return a new refresh_token rarely; if present, store it
	if (data.refresh_token) tokens.refresh_token = data.refresh_token;
	writeTokens(tokens);
	return tokens.access_token!;
}

export function hasRefreshToken() {
	const t = readTokens();
	return !!t.refresh_token;
}
