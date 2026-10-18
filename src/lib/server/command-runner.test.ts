import { expect, mock, test } from 'bun:test';

mock.module('$env/dynamic/private', () => ({ env: {} }));

const { RenderSlots } = await import('./command-runner');
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

test('renders beyond the limit wait, and editor work goes before background work', async () => {
	const slots = new RenderSlots(1);
	const order: string[] = [];
	const first = await slots.acquire('background');
	void slots.acquire('background').then((release) => (order.push('background'), release));
	void slots.acquire('final').then((release) => (order.push('editor'), release));
	await settle();
	expect(order).toEqual([]);
	first();
	await settle();
	expect(order).toEqual(['editor']);
});

test('a render cancelled while queued gives up its place', async () => {
	const slots = new RenderSlots(1);
	const first = await slots.acquire('final');
	const controller = new AbortController();
	const cancelled = slots.acquire('final', controller.signal);
	let started = false;
	void slots.acquire('final').then(() => (started = true));
	controller.abort();
	await expect(cancelled).rejects.toBeDefined();
	first();
	await settle();
	expect(started).toBe(true);
});

test('releasing twice frees only one slot', async () => {
	const slots = new RenderSlots(1);
	const release = await slots.acquire('final');
	release();
	release();
	await slots.acquire('final');
	let second = false;
	void slots.acquire('final').then(() => (second = true));
	await settle();
	expect(second).toBe(false);
});

test('the small preview jumps the queue and has a slot of its own', async () => {
	const slots = new RenderSlots(1);
	const order: string[] = [];
	const running = await slots.acquire('thumbnail');
	for (const priority of ['background', 'thumbnail', 'final'] as const) void slots.acquire(priority).then(() => order.push(priority));
	let quickStarted = false;
	const quick = slots.acquire('quick').then((release) => ((quickStarted = true), release));
	await settle();
	// The reserved slot lets it start even though the only normal slot is busy
	expect(quickStarted).toBe(true);
	(await quick)();
	running();
	await settle();
	expect(order).toEqual(['final']);
});

test('reports how many renders are running', async () => {
	const slots = new RenderSlots(2);
	const first = await slots.acquire('final');
	expect(slots.active).toBe(1);
	const second = await slots.acquire('thumbnail');
	expect(slots.active).toBe(2);
	first();
	second();
	expect(slots.active).toBe(0);
});
