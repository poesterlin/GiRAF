import { expect, mock, test } from 'bun:test';

mock.module('$env/dynamic/private', () => ({ env: {} }));

const { googleRedirectUri } = await import('./google-token');

test('the Google callback works with a bare host name or a full URL', () => {
	expect(googleRedirectUri('photos.example.com')).toBe('https://photos.example.com/api/auth/google/callback');
	expect(googleRedirectUri('https://photos.example.com/')).toBe('https://photos.example.com/api/auth/google/callback');
	expect(googleRedirectUri('http://localhost:4893')).toBe('http://localhost:4893/api/auth/google/callback');
	expect(googleRedirectUri('')).toBe('http://localhost:5173/api/auth/google/callback');
});
