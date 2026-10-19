import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { isGradientMask } from '../src/lib/local-masks';
import { closeProbe, collectPageErrors, createProbeProject, createProbeServer, launchProbeBrowser, listenOnPort, repoRoot, type ProbeBrowser } from './lib/browser-probe';

// Drives the real mask page: adding a gradient mask, its own controls in the panel, and the
// horizon line on the photo, which drags the gradient's centre.

const temporary = await createProbeProject({ prefix: 'giraf-gradient-mask-', tailwind: true });
await writeFile(
	join(temporary, 'App.svelte'),
	`
<script>
 import Masks from '${repoRoot}/src/routes/editor/[img]/masks/+page.svelte';
 let data = $state({ image: { id: 1 }, snapshots: [] });
</script>
<div class="h-[900px]"><Masks {data} /></div>`
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
const settings = { Locallab: { Enabled: true } };
addLocalMask(settings, 'ELI');
let history = 0;
export const edits = $state({
 pp3: settings, throttledPP3: structuredClone(settings), effectivePP3: settings,
 hasChanges: false, canUndo: false, canRedo: false,
 initialize: (_, image) => { edits.currentImageId = String(image.id); },
 updateThrottledPP3: () => {}, pushHistory: () => { history += 1; }, snapshot: async () => {},
 undo: () => {}, redo: () => {}
});
window.probe = {
 locallab: () => JSON.parse(JSON.stringify(edits.pp3.Locallab)),
 history: () => history
};
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
type ProbeWindow = Window & { probe: { locallab(): Record<string, unknown>; history(): number } };
let browser: ProbeBrowser | undefined;
try {
	const port = await listenOnPort(server);
	browser = await launchProbeBrowser();
	const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
	const errors = collectPageErrors(page, { log: true });
	// A real photo when one is given, so the screenshot shows the overlay on a sky
	const photo = process.env.GRADIENT_PROBE_PHOTO;
	const body = photo ? await readFile(photo) : '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"></svg>';
	await page.route('**/api/images/*/edit?*', (route) => route.fulfill({ contentType: photo ? 'image/png' : 'image/svg+xml', body }));
	const locallab = () => page.evaluate(() => (window as unknown as ProbeWindow).probe.locallab());

	await page.goto(`http://127.0.0.1:${port}`, { waitUntil: 'domcontentloaded' });
	await page.getByRole('button', { name: 'Add gradient' }).click();

	const added = await locallab();
	assert.equal(added.Selspot, 1, 'the new gradient is selected');
	assert.equal(added.Name_1, 'Gradient 2');
	assert.ok(isGradientMask({ Locallab: added as Record<string, string | number | boolean> }, 1));
	assert.equal(added.Strcol_1, 1, 'a fresh gradient darkens visibly');

	// The panel offers the gradient's own controls, and none of the region sliders
	for (const label of ['Strength', 'Angle', 'Softness']) await page.getByLabel(`${label} value`).waitFor();
	for (const label of ['Feather', 'Exposure']) assert.equal(await page.getByLabel(`${label} value`).count(), 0, `${label} is not offered for a gradient`);
	assert.equal(await page.getByRole('button', { name: 'Enable Sharpening' }).count(), 0, 'no per-mask tools for a gradient');

	await page.locator('input[type="range"][aria-label="Angle"]').evaluate((input: HTMLInputElement) => {
		input.value = '30';
		input.dispatchEvent(new Event('input', { bubbles: true }));
	});
	assert.equal((await locallab()).Angcol_1, 30);

	// Dragging the horizon handle moves the gradient's centre
	const handle = page.getByRole('button', { name: 'Move Gradient 2' });
	const box = (await handle.boundingBox())!;
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
	await page.mouse.down();
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 - 80, { steps: 5 });
	await page.mouse.up();
	const moved = await locallab();
	assert.ok(Number(moved.CenterY_1) < 0, `the horizon moved up (CenterY ${moved.CenterY_1})`);
	assert.equal(moved.CenterY_0, 0, 'the other mask stays put');

	// Switching back to the ellipse brings its region controls back
	await page.getByLabel('Selected mask').selectOption('0');
	await page.getByLabel('Feather value').waitFor();

	if (process.env.GRADIENT_PROBE_SHOT) {
		await page.getByLabel('Selected mask').selectOption('1');
		await page.getByLabel('Strength value').waitFor();
		await page.screenshot({ path: process.env.GRADIENT_PROBE_SHOT });
	}
	assert.deepEqual(errors, []);
	console.log('PASS: a gradient mask is added, offers strength, angle and softness, and its horizon drags the centre');
} finally {
	await closeProbe({ browser, server, temporary });
}
