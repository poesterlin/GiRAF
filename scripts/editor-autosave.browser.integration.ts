import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { closeProbe, collectPageErrors, createProbeProject, createProbeServer, launchProbeBrowser, listenOnPort, repoRoot, type ProbeBrowser } from './lib/browser-probe';

// Exercise the real autosave loop: the editing state, the version classifier and
// the snapshot queue, with the server endpoints stubbed by the route handler.
const temporary = await createProbeProject({ prefix: 'giraf-autosave-', tailwind: true });
await writeFile(
	join(temporary, 'App.svelte'),
	`
<script>
 import EditorAutosave from '${repoRoot}/src/lib/ui/EditorAutosave.svelte';
 import { edits } from '$lib/state/editing.svelte';
 import BasePP3 from '${repoRoot}/src/lib/assets/client.pp3?raw';
 const image = { id: 12, whiteBalance: 5500, tint: 0 };
 edits.initialize(BasePP3, image);
 window.fixture = {
  edits,
  image,
  navigate: null,
  edit(chapter, values) {
   edits.pp3[chapter] = { ...(edits.pp3[chapter] ?? {}), ...values };
   edits.pushHistory();
  },
  leave() {
   window.fixture.navigate?.();
  }
 };
</script>
<EditorAutosave />`
);
await writeFile(
	join(temporary, 'context.svelte.ts'),
	`
export const page = $state({
 url: new URL('http://localhost/editor/12'),
 params: { img: '12' },
 data: {
  image: { id: 12, lastExportedAt: null },
  snapshots: [{ id: 7, createdAt: new Date().toISOString(), pp3: '' }]
 }
});
export const beforeNavigate = (callback) => { window.fixture.navigate = callback; };
export const invalidateAll = async () => {};
`
);
await writeFile(join(temporary, 'app.ts'), `export const app = { toasts: [], addToast: (message, type) => { window.toasts.push({ message, type }); return 'toast'; } };`);
const server = await createProbeServer(temporary, {
	tailwind: true,
	aliases: [
		{ find: '$lib/state/app.svelte', replacement: join(temporary, 'app.ts') },
		{ find: /^\$app\/(state|navigation)$/, replacement: join(temporary, 'context.svelte.ts') },
		{ find: '$app/environment', replacement: join(temporary, 'app.ts') }
	]
});

type Save = { method: string; body: { pp3: string; snapshotId?: number } };
type ProbeWindow = Window & {
	toasts: { message: string; type: string }[];
	fixture: {
		edits: {
			currentImageId?: string | null;
			hasChanges: boolean;
			serialize(): string;
			noteSavedVersion(imageId: string, snapshot: { id: number; createdAt: string; pp3: string }, exportedAt: null): void;
		};
		edit(chapter: string, values: Record<string, unknown>): void;
		leave(): void;
	};
};
let browser: ProbeBrowser | undefined;
try {
	const port = await listenOnPort(server);
	browser = await launchProbeBrowser();
	const page = await browser.newPage({ viewport: { width: 1280, height: 700 } });
	const errors = collectPageErrors(page);
	const saves: Save[] = [];
	let refuseUpdates = false;
	let nextId = 70;
	// Like the real server: an in-place update keeps the version's creation time
	const versionStarted = new Map<number, string>([[7, new Date(Date.now() - 6 * 60_000).toISOString()]]);
	await page.addInitScript(() => ((window as ProbeWindow).toasts = []));
	await page.route('**/api/images/12/snapshots', async (route) => {
		const request = route.request();
		const body = request.postDataJSON();
		saves.push({ method: request.method(), body });
		if (request.method() === 'PATCH' && refuseUpdates) {
			await route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ error: 'Only the latest snapshot can be updated' }) });
			return;
		}
		const id = body.snapshotId ?? ++nextId;
		if (!versionStarted.has(id)) versionStarted.set(id, new Date().toISOString());
		await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id, createdAt: versionStarted.get(id) }) });
	});
	async function waitForSaves(target: number, timeout = 8000) {
		const started = Date.now();
		while (saves.length < target) {
			if (Date.now() - started > timeout) throw new Error(`Timed out waiting for ${target} saves, saw ${saves.length}`);
			await new Promise((resolve) => setTimeout(resolve, 50));
		}
	}

	await page.goto(`http://127.0.0.1:${port}/`);
	await page.waitForFunction(() => Boolean((window as ProbeWindow).fixture?.edits?.currentImageId));
	await page.evaluate(() => {
		const state = (window as ProbeWindow).fixture.edits;
		// Old enough that autosave may start a new version, younger than the interval that forces one
		state.noteSavedVersion('12', { id: 7, createdAt: new Date(Date.now() - 6 * 60_000).toISOString(), pp3: state.serialize() }, null);
	});

	// A still edit waits for the idle delay instead of writing per slider step.
	await page.evaluate(() => (window as ProbeWindow).fixture.edit('Exposure', { Compensation: 0.2 }));
	await page.waitForTimeout(600);
	assert.deepEqual(saves, [], 'autosave must not write while the edit is still moving');
	await waitForSaves(1);
	assert.equal(saves.length, 1);
	assert.equal(saves[0].method, 'PATCH');
	assert.equal(saves[0].body.snapshotId, 7, 'a small tweak updates the newest version in place');

	// More tweaks keep landing on the same version.
	await page.evaluate(() => (window as ProbeWindow).fixture.edit('Exposure', { Compensation: 0.4 }));
	await waitForSaves(2);
	assert.deepEqual(
		saves.map((save) => `${save.method} ${save.body.snapshotId ?? ''}`),
		['PATCH 7', 'PATCH 7']
	);

	// Structural work earns a version of its own.
	await page.evaluate(() => (window as ProbeWindow).fixture.edit('Crop', { Enabled: true, X: 40, Y: 20, W: 900, H: 600 }));
	await waitForSaves(3);
	assert.equal(saves[2].method, 'POST');
	assert.equal(saves[2].body.snapshotId, undefined);

	// More structure right away lands on that young version instead of starting another.
	await page.evaluate(() => (window as ProbeWindow).fixture.edit('Crop', { Enabled: true, X: 60, Y: 20, W: 880, H: 600 }));
	await waitForSaves(4);
	assert.equal(saves[3].method, 'PATCH', 'a young version is updated even for structural changes');

	// A version the server no longer accepts is replaced instead of lost.
	refuseUpdates = true;
	await page.evaluate(() => (window as ProbeWindow).fixture.edit('Exposure', { Compensation: 0.6 }));
	await waitForSaves(6);
	assert.deepEqual(
		saves.slice(4).map((save) => save.method),
		['PATCH', 'POST']
	);
	refuseUpdates = false;

	// Leaving the editor flushes whatever is still pending.
	const pending = await page.evaluate(() => {
		const fixture = (window as ProbeWindow).fixture;
		fixture.edit('Exposure', { Compensation: 0.9 });
		const before = fixture.edits.hasChanges;
		fixture.leave();
		return before;
	});
	assert.equal(pending, true);
	await waitForSaves(7);
	assert.equal(await page.evaluate(() => (window as ProbeWindow).fixture.edits.hasChanges), false, 'the pending edit is saved before navigating');

	// Nothing left to save means nothing left to write.
	const count = saves.length;
	await page.evaluate(() => (window as ProbeWindow).fixture.leave());
	await page.waitForTimeout(500);
	assert.equal(saves.length, count);
	assert.deepEqual(await page.evaluate(() => (window as ProbeWindow).toasts), []);
	assert.deepEqual(errors, []);
	console.log('PASS: autosave debounces, updates in place, versions structural work, replaces refused versions and flushes on leave');
} finally {
	await closeProbe({ browser, server, temporary });
}
