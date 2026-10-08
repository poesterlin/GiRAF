import { afterEach, expect, test } from 'bun:test';
import { assignPendingUploads, createUploadAssignment } from './upload-assignment';

const originalFetch = globalThis.fetch;
test('one mixed selection assigns uploaded photos immediately and pending photos into the same session', async () => {
	const requests: Record<string, unknown>[] = [];
	globalThis.fetch = (async (input: Parameters<typeof fetch>[0], options?: RequestInit) => {
		expect(input).toBe('/api/imports');
		requests.push(JSON.parse(String(options?.body)));
		return Response.json({ sessionId: 27 });
	}) as unknown as typeof fetch;
	let finishUpload!: (id: number) => void;
	const uploading = new Promise<number>((resolve) => {
		finishUpload = resolve;
	});
	const assigned: number[] = [];
	const done = assignPendingUploads(
		[uploading, Promise.resolve(101), Promise.resolve(102)],
		{ name: 'Mixed selection' },
		(index) => assigned.push(index),
		(error) => {
			throw error;
		}
	);
	await new Promise((resolve) => setTimeout(resolve, 0));
	expect(requests).toEqual([
		{ name: 'Mixed selection', importIds: [101], enqueue: true },
		{ sessionId: 27, importIds: [102], enqueue: true }
	]);
	expect(assigned).toEqual([1, 2]);
	finishUpload(103);
	await done;
	expect(requests[2]).toEqual({ sessionId: 27, importIds: [103], enqueue: true });
	expect(assigned).toEqual([1, 2, 0]);
});
test('captures pending grouping without transferring again and reuses the created session', async () => {
	const requests: Record<string, unknown>[] = [];
	globalThis.fetch = (async (input: Parameters<typeof fetch>[0], options?: RequestInit) => {
		expect(input).toBe('/api/imports');
		requests.push(JSON.parse(String(options?.body)));
		return Response.json({ sessionId: 17 });
	}) as typeof fetch;
	let finishFirst!: (id: number) => void;
	let finishSecond!: (id: number) => void;
	const first = new Promise<number>((resolve) => {
		finishFirst = resolve;
	});
	const second = new Promise<number>((resolve) => {
		finishSecond = resolve;
	});
	const target = { name: 'Captured' };
	const assigned: number[] = [];
	const done = assignPendingUploads(
		[first, second, Promise.resolve(undefined)],
		target,
		(index) => assigned.push(index),
		(error) => {
			throw error;
		}
	);
	target.name = 'Changed after navigation';
	expect(requests).toHaveLength(0);
	finishSecond(2);
	await new Promise((resolve) => setTimeout(resolve, 0));
	expect(requests).toEqual([{ name: 'Captured', importIds: [2], enqueue: true }]);
	finishFirst(1);
	await done;
	expect(requests[1]).toEqual({ sessionId: 17, importIds: [1], enqueue: true });
	expect(assigned).toEqual([1, 0]);
});
afterEach(() => {
	globalThis.fetch = originalFetch;
});

test('assigns the first completed file while another transfer is pending and serializes session creation', async () => {
	const requests: Record<string, unknown>[] = [];
	let finishCreation!: (response: Response) => void;
	globalThis.fetch = (async (_input: Parameters<typeof fetch>[0], options?: RequestInit) => {
		requests.push(JSON.parse(String(options?.body)));
		if (requests.length === 1)
			return new Promise<Response>((resolve) => {
				finishCreation = resolve;
			});
		return Response.json({ sessionId: 42 });
	}) as unknown as typeof fetch;
	const sessions: number[] = [];
	const assign = createUploadAssignment({ name: 'Shoot' }, (id) => sessions.push(id));
	let finishTransfer!: (id: number) => void;
	const laterTransfer = new Promise<number>((resolve) => {
		finishTransfer = resolve;
	}).then((id) => assign([id]));
	const first = assign([1]);
	await Promise.resolve();
	expect(requests).toEqual([{ name: 'Shoot', importIds: [1], enqueue: true }]);
	// Even two more completions before creation resolves must reuse that session.
	const duplicate = assign([2]);
	finishTransfer(3);
	await Promise.resolve();
	expect(requests).toHaveLength(1);
	finishCreation(Response.json({ sessionId: 42 }));
	await Promise.all([first, duplicate, laterTransfer]);
	expect(requests.slice(1)).toEqual([
		{ sessionId: 42, importIds: [2], enqueue: true },
		{ sessionId: 42, importIds: [3], enqueue: true }
	]);
	expect(sessions).toEqual([42, 42, 42]);
});

test('retains a committed session after an assignment error and continues subsequent files', async () => {
	const requests: Record<string, unknown>[] = [];
	globalThis.fetch = (async (_input: Parameters<typeof fetch>[0], options?: RequestInit) => {
		requests.push(JSON.parse(String(options?.body)));
		return requests.length === 1 ? Response.json({ sessionId: 8, assignmentCommitted: true, message: 'Busy' }, { status: 409 }) : Response.json({ sessionId: 8 });
	}) as unknown as typeof fetch;
	let resolved: number | undefined;
	const assign = createUploadAssignment({ name: 'Shoot' }, (id) => {
		resolved = id;
	});
	await expect(assign([1])).rejects.toThrow('Busy');
	expect(resolved).toBe(8);
	await assign([2]);
	expect(requests[1]).toEqual({ sessionId: 8, importIds: [2], enqueue: true });
});
