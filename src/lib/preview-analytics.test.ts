import { expect, test } from 'bun:test';
import { previewResponseMetrics, readServerTimings } from './preview-analytics';

test('extracts server phases without reporting malformed durations', () => {
	expect(readServerTimings('database;dur=2.5, source;dur=1432.8, render;dur=240.1, read;dur=1, invalid;dur=NaN')).toEqual({ server_databaseMs: 2.5, server_sourceMs: 1432.8, server_renderMs: 240.1, server_readMs: 1 });
	expect(readServerTimings(null)).toEqual({});
});

test('cached responses cannot report old server timings as fresh work', () => {
	const response = new Response('jpeg', { headers: {
		'X-Preview-Request': 'previous-request', 'Server-Timing': 'render;dur=3600', 'X-Preview-Cache': 'miss'
	} });
	const reused = previewResponseMetrics(response, 'new-request');
	expect(reused.responseReuse).toBe('reused');
	expect(reused.serverTimingsFresh).toBe(false);
	expect(reused.server_renderMs).toBeUndefined();
	expect(reused.serverCache).toBe('not-current');
	const fresh = previewResponseMetrics(response, 'previous-request');
	expect(fresh.responseReuse).toBe('fresh');
	expect(fresh.server_renderMs).toBe(3600);
	expect(previewResponseMetrics(new Response(), 'new-request').responseReuse).toBe('unknown');
});
