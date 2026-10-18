import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { closeProbe, collectPageErrors, createProbeProject, createProbeServer, launchProbeBrowser, listenOnPort, repoRoot, type ProbeBrowser } from './lib/browser-probe';

const temporary = await createProbeProject({ prefix: 'giraf-mask-preview-', tailwind: true });
await writeFile(
	join(temporary, 'App.svelte'),
	`
<script>
 import Masks from '${repoRoot}/src/routes/editor/[img]/masks/+page.svelte';
 let data = $state({ image: { id: 1 }, snapshots: [] });
 window.switchPhoto = () => { data = { image: { id: 2 }, snapshots: [] }; };
</script>
<div class="h-[650px]"><Masks {data} /></div>`
);
await writeFile(
	join(temporary, 'context.ts'),
	`
export const browser = true;
export const beforeNavigate = () => {};
export const page = { url: new URL('http://localhost/editor/1/masks'), params: { img: '1' }, data: {} };
`
);
await writeFile(
	join(temporary, 'editing.svelte.ts'),
	`
import { addLocalMask } from '${repoRoot}/src/lib/local-masks';
const initial = { Locallab: { Enabled: true } };
addLocalMask(initial, 'ELI');
initial.Locallab.CenterX_0 = 400; initial.Locallab.CenterY_0 = -200;
export const edits = $state({
 pp3: structuredClone(initial), throttledPP3: structuredClone(initial), effectivePP3: initial,
 hasChanges: false, canUndo: false, canRedo: false,
 initialize: (_, image) => { edits.currentImageId = String(image.id); },
 updateThrottledPP3: () => {}, pushHistory: () => {}, snapshot: async () => {},
 undo: () => {}, redo: () => {}
});
window.refreshPreview = () => { edits.throttledPP3 = { ...edits.throttledPP3, Exposure: { Compensation: 1 } }; };
`
);
const server = await createProbeServer(temporary, {
	tailwind: true,
	noDiscovery: true,
	aliases: [
		{ find: '$lib/state/editing.svelte', replacement: join(temporary, 'editing.svelte.ts') },
		{ find: /^\$app\/(environment|state|navigation)$/, replacement: join(temporary, 'context.ts') }
	]
});
type ProbeWindow = Window & { refreshPreview(): void; switchPhoto(): void };
let browser: ProbeBrowser | undefined;
try {
	const port = await listenOnPort(server);
	browser = await launchProbeBrowser();
	const page = await browser.newPage({ viewport: { width: 1280, height: 700 } });
	const errors = collectPageErrors(page, { log: true });
	const pending: { id: string; release: () => Promise<void> }[] = [];
	await page.route('**/api/images/*/edit?*', async (route) => {
		const id = new URL(route.request().url()).pathname.split('/')[3];
		let release!: () => void;
		const gate = new Promise<void>((resolve) => {
			release = resolve;
		});
		pending.push({
			id,
			release: async () => {
				release();
			}
		});
		await gate;
		const width = id === '1' ? 400 : 900;
		const height = id === '1' ? 800 : 300;
		await route.fulfill({
			contentType: 'image/svg+xml',
			body: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#525252" /></svg>`
		});
	});
	const visibleMasks = () => page.getByRole('button', { name: 'Move Mask 1' });
	const waitPending = async (count: number) => {
		const deadline = Date.now() + 10000;
		while (pending.length < count && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 20));
		assert.ok(pending.length >= count, 'Preview request must reach the delayed fixture');
	};
	await page.goto(`http://127.0.0.1:${port}`, { waitUntil: 'domcontentloaded' });
	await waitPending(1);
	assert.equal(await visibleMasks().isVisible(), false, 'No floating mask before the first photo dimensions are known');
	await pending[0].release();
	await visibleMasks().waitFor();
	const geometry = await visibleMasks().evaluate((button) => {
		const image = document.querySelector('img')!;
		const photo = image.getBoundingClientRect();
		const mask = button.getBoundingClientRect();
		return { aspect: photo.width / photo.height, x: (mask.x + mask.width / 2 - photo.x) / photo.width, y: (mask.y + mask.height / 2 - photo.y) / photo.height };
	});
	assert.ok(Math.abs(geometry.aspect - 0.5) < 0.01);
	assert.ok(Math.abs(geometry.x - 0.7) < 0.01 && Math.abs(geometry.y - 0.4) < 0.01);
	await page.evaluate(() => (window as ProbeWindow).refreshPreview());
	await waitPending(2);
	assert.equal(await visibleMasks().isVisible(), true, 'Same-photo updates keep stable mask geometry visible');
	await pending[1].release();
	await page.evaluate(() => (window as ProbeWindow).switchPhoto());
	await waitPending(3);
	assert.equal(await visibleMasks().isVisible(), false, 'Photo changes must not show masks using the previous photo aspect ratio');
	await pending[2].release();
	await visibleMasks().waitFor();
	const aspect = await page
		.locator('img')
		.first()
		.evaluate((image) => {
			const r = image.getBoundingClientRect();
			return r.width / r.height;
		});
	assert.ok(Math.abs(aspect - 3) < 0.01);
	assert.deepEqual(errors, []);
	console.log('PASS: delayed initial preview, stable same-photo updates, and portrait-to-landscape navigation');
} finally {
	await closeProbe({ browser, server, temporary });
}
