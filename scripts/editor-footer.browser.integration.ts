import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { closeProbe, collectPageErrors, createProbeProject, createProbeServer, launchProbeBrowser, listenOnPort, repoRoot, type ProbeBrowser } from './lib/browser-probe';

// Exercise the real shared layout, footer, tool history binding, and filters,
// without connecting to a photo database or writing any real edits.
const temporary = await createProbeProject({ prefix: 'giraf-footer-', tailwind: true });
await writeFile(
	join(temporary, 'App.svelte'),
	`
<script>
 import Layout from '${repoRoot}/src/routes/editor/[img]/+layout.svelte';
 import HistoryBinding from '${repoRoot}/src/lib/ui/EditorHistoryBinding.svelte';
</script>
<div class="h-[500px] w-full bg-neutral-950">
 <Layout>
  <aside class="ml-auto flex h-full w-[380px] flex-col">
   <div class="min-h-0 flex-1 overflow-auto">Tool content</div>
   <HistoryBinding onundo={() => window.calls.push('tool-undo')} onredo={() => window.calls.push('tool-redo')} />
  </aside>
 </Layout>
</div>`
);
await writeFile(
	join(temporary, 'context.svelte.ts'),
	`
const tool = new URL(location.href).searchParams.get('tool') ?? 'adjustments';
export const page = $state({
 url: new URL('http://localhost/editor/12' + (tool === 'adjustments' ? '' : '/' + tool) + '?edited=any&archived=hide&cutoff=workflow'),
 params: { img: '12' },
 data: { image: { id: 12, isArchived: false }, currentImagePosition: 12, matchingImageCount: 148, previousImage: 11, nextImage: 13, hasMatchingImages: true }
});
export const beforeNavigate = () => {};
export const invalidateAll = async () => { window.calls.push('invalidate'); if (window.archiveMethod) page.data.image.isArchived = window.archiveMethod === 'POST'; };
export const goto = async destination => { window.calls.push(destination); };
`
);
await writeFile(
	join(temporary, 'editing.svelte.ts'),
	`
window.calls = [];
export const edits = $state({
 currentImageId: '12', pp3: {}, disabledGroups: [], editStrength: 100,
 effectivePP3: {}, canUndo: true, canRedo: true, hasChanges: false,
 changeRevision: 0, isSaving: false, isFaulty: false,
 updateThrottledPP3: () => {}, snapshot: async () => { window.calls.push('snapshot'); },
 noteSavedVersion: (imageId, snapshot) => { (window.versions ??= []).push(imageId + ':' + (snapshot?.id ?? 'none')); },
 reset: () => { window.calls.push('reset'); }, pushHistory: () => { window.calls.push('history'); },
 undo: () => { window.calls.push('default-undo'); }, redo: () => { window.calls.push('default-redo'); }
});
window.fixture = { page: undefined, edits };
`
);
await writeFile(join(temporary, 'app.ts'), `export const app = { toasts: [], addToast: () => 'toast' };`);
const server = await createProbeServer(temporary, {
	tailwind: true,
	aliases: [
		{ find: '$lib/state/editing.svelte', replacement: join(temporary, 'editing.svelte.ts') },
		{ find: '$lib/state/app.svelte', replacement: join(temporary, 'app.ts') },
		{ find: /^\$app\/(state|navigation)$/, replacement: join(temporary, 'context.svelte.ts') }
	]
});
let browser: ProbeBrowser | undefined;
try {
	const port = await listenOnPort(server);
	browser = await launchProbeBrowser();
	const page = await browser.newPage({ viewport: { width: 1280, height: 700 } });
	const errors = collectPageErrors(page, { log: true });
	await page.route('**/api/images/12/archive', async (route) => {
		await page.evaluate((method) => {
			(window as any).archiveMethod = method;
		}, route.request().method());
		await route.fulfill({ status: 200, body: '{}' });
	});
	for (const tool of ['adjustments', 'crop', 'masks', 'retouch']) {
		await page.goto(`http://127.0.0.1:${port}/?tool=${tool}`);
		const footer = page.getByRole('navigation', { name: 'Image navigation' });
		await footer.getByRole('button', { name: 'Undo', exact: true }).waitFor();
		assert.equal(await footer.getByRole('button', { name: 'Save edits' }).count(), 0, 'autosave replaces the manual save button');
		assert.match(await footer.locator('.save-state').innerText(), /Saved|Unsaved|Saving/);
		assert.deepEqual(await page.evaluate(() => (window as any).versions), ['12:none'], 'autosave learns the newest saved version');
		assert.equal(await footer.getByLabel('More photo actions').isVisible(), false);
		assert.match(await footer.locator('.image-counter').innerText(), /12\s*\/\s*148\s*·\s*filtered/);
		const previous = await footer.getByLabel('Previous image').boundingBox();
		const counter = await footer.locator('.image-counter').boundingBox();
		const next = await footer.getByLabel('Next image').boundingBox();
		assert.ok(previous && counter && next && previous.x < counter.x && counter.x < next.x);
		const rowHeight = await footer.boundingBox();
		assert.equal(rowHeight?.height, 112);
		const padding = await page.locator('aside').evaluate((e) => getComputedStyle(e).paddingBottom);
		assert.equal(padding, '112px', 'tool controls must remain above the footer');
		await footer.getByLabel('Undo', { exact: true }).click();
		await footer.getByLabel('Redo', { exact: true }).click();
		await page.locator('body').click({ position: { x: 5, y: 600 } });
		await page.keyboard.press('z');
		await page.keyboard.press('y');
		await page.keyboard.press('Control+z');
		await page.keyboard.press('Control+Shift+z');
		assert.deepEqual(await page.evaluate(() => (window as any).calls), ['tool-undo', 'tool-redo', 'tool-undo', 'tool-redo', 'tool-undo', 'tool-redo']);
		await page.evaluate(() => {
			(window as any).calls = [];
		});
		await footer.getByLabel('Reset edits', { exact: true }).click();
		await page.waitForFunction(() => (window as any).calls.includes('invalidate'));
		assert.deepEqual(await page.evaluate(() => (window as any).calls), ['snapshot', tool === 'adjustments' ? 'reset' : 'history', 'snapshot', 'invalidate']);
		await page.evaluate(() => {
			(window as any).calls = [];
		});
		await footer.getByLabel('Archive photo', { exact: true }).click();
		await footer.getByLabel('Restore photo', { exact: true }).waitFor();
		await footer.getByLabel('Restore photo', { exact: true }).click();
		await footer.getByLabel('Archive photo', { exact: true }).waitFor();
		assert.equal(await page.evaluate(() => (window as any).archiveMethod), 'DELETE');
		await page.evaluate(() => {
			(window as any).calls = [];
		});
		await footer.getByLabel('Next image').click();
		const destination = '/editor/13' + (tool === 'adjustments' ? '' : '/' + tool) + '?edited=any&archived=hide&cutoff=workflow';
		await page.waitForFunction((destination) => (window as any).calls.includes(destination), destination);
		assert.deepEqual(await page.evaluate(() => (window as any).calls), ['snapshot', destination]);
		await footer.getByRole('button', { name: 'Filter gallery' }).click();
		await page.locator('dialog:modal').waitFor();
		await page.keyboard.press('Escape');
		await page.locator('dialog:modal').waitFor({ state: 'detached' });
		console.log('PASS: ' + tool + ' desktop layout, tool history, shortcuts, reset, archive/restore, navigation and filter');
	}
	if (process.env.EDITOR_FOOTER_SCREENSHOT) {
		await page.mouse.move(1, 1);
		await page.getByRole('navigation', { name: 'Image navigation' }).screenshot({ path: process.env.EDITOR_FOOTER_SCREENSHOT });
	}
	await page.setViewportSize({ width: 390, height: 700 });
	const footer = page.getByRole('navigation', { name: 'Image navigation' });
	assert.match(await footer.locator('.save-state').innerText(), /Saved|Unsaved|Saving/);
	assert.equal(await footer.getByLabel('More photo actions').isVisible(), true);
	assert.equal(await footer.getByLabel('Editing actions').isVisible(), false);
	assert.deepEqual(errors, []);
	console.log('PASS: mobile footer controls remain available');
} finally {
	await closeProbe({ browser, server, temporary });
}
