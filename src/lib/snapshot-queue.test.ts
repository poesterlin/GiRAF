import { afterEach, expect, test } from 'bun:test';
import { SnapshotQueue } from './snapshot-queue';

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

test('saves are ordered across images and capture their original serialized document', async () => {
	const calls: { url: string; body: string }[] = [];
	let completeFirst!: (response: Response) => void;
	globalThis.fetch = (async (url, options) => {
		calls.push({ url: String(url), body: String(options?.body) });
		if (calls.length === 1) return new Promise<Response>((resolve) => { completeFirst = resolve; });
		return new Response(null, { status: 200 });
	}) as typeof fetch;
	const queue = new SnapshotQueue();
	const first = queue.save('1', 'first');
	const second = queue.save('2', 'second');
	for (let i = 0; i < 10; i++) await Promise.resolve();
	expect(calls).toHaveLength(1);
	expect(queue.hasPending('1')).toBe(true);
	expect(queue.hasPending('2')).toBe(true);
	completeFirst(new Response(null, { status: 200 }));
	await Promise.all([first, second]);
	expect(calls).toEqual([
		{ url: '/api/images/1/snapshots', body: JSON.stringify({ pp3: 'first' }) },
		{ url: '/api/images/2/snapshots', body: JSON.stringify({ pp3: 'second' }) }
	]);
	expect(queue.hasPending('1')).toBe(false);
	expect(queue.hasPending('2')).toBe(false);
});

test('failed saves release their pending count and do not block later writes', async () => {
	let calls = 0;
	globalThis.fetch = (async () => new Response(null, { status: ++calls === 1 ? 500 : 200 })) as unknown as typeof fetch;
	const queue = new SnapshotQueue();
	const failed = queue.save('1', 'first');
	const next = queue.save('1', 'second');
	await expect(failed).rejects.toThrow('Failed to save snapshot');
	await next;
	expect(calls).toBe(2);
	expect(queue.hasPending('1')).toBe(false);
});
