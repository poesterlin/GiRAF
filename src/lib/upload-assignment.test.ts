import { afterEach, expect, test } from 'bun:test';
import { createUploadAssignment } from './upload-assignment';

const originalFetch = globalThis.fetch;
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
