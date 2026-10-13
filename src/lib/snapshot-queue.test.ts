import { afterEach, expect, test } from 'bun:test';
import { SnapshotQueue } from './snapshot-queue';

const originalFetch = globalThis.fetch;
afterEach(() => {
	globalThis.fetch = originalFetch;
});

function saved(id: number) {
	return new Response(JSON.stringify({ id, createdAt: '2026-02-09T10:00:00.000Z' }), { status: 201 });
}

test('saves are ordered across images and capture their original serialized document', async () => {
	const calls: { url: string; body: string }[] = [];
	let completeFirst!: (response: Response) => void;
	let nextId = 10;
	globalThis.fetch = (async (url, options) => {
		calls.push({ url: String(url), body: String(options?.body) });
		if (calls.length === 1)
			return new Promise<Response>((resolve) => {
				completeFirst = resolve;
			});
		return saved(nextId++);
	}) as typeof fetch;
	const queue = new SnapshotQueue();
	const first = queue.save('1', 'first');
	const second = queue.save('2', 'second');
	for (let i = 0; i < 10; i++) await Promise.resolve();
	expect(calls).toHaveLength(1);
	expect(queue.hasPending('1')).toBe(true);
	expect(queue.hasPending('2')).toBe(true);
	completeFirst(saved(nextId++));
	expect(await first).toMatchObject({ id: 10 });
	expect(await second).toMatchObject({ id: 11 });
	expect(calls).toEqual([
		{ url: '/api/images/1/snapshots', body: JSON.stringify({ pp3: 'first' }) },
		{ url: '/api/images/2/snapshots', body: JSON.stringify({ pp3: 'second' }) }
	]);
	expect(queue.hasPending('1')).toBe(false);
	expect(queue.hasPending('2')).toBe(false);
});

test('failed saves release their pending count and do not block later writes', async () => {
	let calls = 0;
	globalThis.fetch = (async () => (++calls === 1 ? new Response(null, { status: 500 }) : saved(20))) as unknown as typeof fetch;
	const queue = new SnapshotQueue();
	const failed = queue.save('1', 'first');
	const next = queue.save('1', 'second');
	await expect(failed).rejects.toThrow('Failed to save snapshot');
	expect(await next).toMatchObject({ id: 20 });
	expect(calls).toBe(2);
	expect(queue.hasPending('1')).toBe(false);
});

test('a snapshot id updates the latest snapshot in place', async () => {
	const calls: { method: string; body: string }[] = [];
	globalThis.fetch = (async (_url, options) => {
		calls.push({ method: String(options?.method), body: String(options?.body) });
		return saved(30);
	}) as typeof fetch;
	const queue = new SnapshotQueue();
	expect(await queue.save('1', 'edited', 30)).toMatchObject({ id: 30 });
	expect(calls).toEqual([{ method: 'PATCH', body: JSON.stringify({ pp3: 'edited', snapshotId: 30 }) }]);
});

test('a snapshot that is no longer the newest falls back to a new version', async () => {
	const calls: { method: string; body: string }[] = [];
	globalThis.fetch = (async (_url, options) => {
		const method = String(options?.method);
		calls.push({ method, body: String(options?.body) });
		return method === 'PATCH' ? new Response(null, { status: 409 }) : saved(31);
	}) as typeof fetch;
	const queue = new SnapshotQueue();
	expect(await queue.save('1', 'edited', 30)).toMatchObject({ id: 31 });
	expect(calls.map((call) => call.method)).toEqual(['PATCH', 'POST']);
	expect(calls[1].body).toBe(JSON.stringify({ pp3: 'edited' }));
	expect(queue.hasPending('1')).toBe(false);
});

test('an untrusted response body is not treated as a saved snapshot', async () => {
	globalThis.fetch = (async () => new Response('not json', { status: 200 })) as unknown as typeof fetch;
	const queue = new SnapshotQueue();
	await expect(queue.save('1', 'edited')).rejects.toThrow('Failed to save snapshot');
	expect(queue.hasPending('1')).toBe(false);
});
