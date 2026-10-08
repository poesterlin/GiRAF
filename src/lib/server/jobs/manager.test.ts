import { expect, mock, test } from 'bun:test';

const runs: { type: string; signal?: AbortSignal; finish: () => void }[] = [];
const run = (type: string, signal?: AbortSignal) =>
	new Promise<{ status: 'success' }>((resolve) => {
		runs.push({ type, signal, finish: () => resolve({ status: 'success' }) });
	});
mock.module('./executor', () => ({
	runImport: (_payload: unknown, signal?: AbortSignal) => run('import', signal),
	runExport: (_payload: unknown, signal?: AbortSignal) => run('export', signal)
}));
mock.module('$lib/server/notifications', () => ({ appendNotification: async () => {} }));
mock.module('$lib/server/db', () => ({ db: { query: { sessionTable: { findFirst: async () => ({ name: 'Test' }) } } } }));

const { JobManager } = await import('./manager');
const { JobType } = await import('./types');
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

test('arrivals during import coalesce into one rerun and arrivals during that rerun are not dropped', async () => {
	runs.length = 0;
	const manager = new JobManager();
	manager.queueImport(1);
	manager.queueImport(1);
	manager.queueImport(1);
	expect(runs).toHaveLength(1);
	runs[0].finish();
	await settle();
	expect(runs).toHaveLength(2);
	manager.queueImport(1);
	runs[1].finish();
	await settle();
	expect(runs).toHaveLength(3);
	runs[2].finish();
	await settle();
	expect(runs).toHaveLength(3);
	expect(manager.getActiveJobs()).toEqual([]);
});

test('committed import arriving during export starts after export exits', async () => {
	runs.length = 0;
	const manager = new JobManager();
	manager.submit(JobType.EXPORT, { sessionId: 2 });
	manager.queueImport(2);
	expect(runs.map((r) => r.type)).toEqual(['export']);
	runs[0].finish();
	await settle();
	expect(runs.map((r) => r.type)).toEqual(['export', 'import']);
	runs[1].finish();
	await settle();
});

test('cancel and terminate discard scheduled imports without an automatic restart', async () => {
	for (const terminate of [false, true]) {
		runs.length = 0;
		const manager = new JobManager();
		manager.queueImport(3);
		manager.queueImport(3);
		if (terminate) manager.terminate();
		else manager.cancel(3);
		expect(runs[0].signal?.aborted).toBe(true);
		runs[0].finish();
		await settle();
		expect(runs).toHaveLength(1);
		expect(manager.getActiveJobs()).toEqual([]);
	}
});
