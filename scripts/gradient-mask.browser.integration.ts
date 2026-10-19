import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { isGradientMask } from '../src/lib/local-masks';
import { closeProbe, collectPageErrors, createProbeProject, createProbeServer, launchProbeBrowser, listenOnPort, repoRoot, type ProbeBrowser } from './lib/browser-probe';

// Drives the real mask page: turning a mask into a gradient with the type selector, the
// gradient's own controls in the panel, and the horizon line on the photo, which drags its centre.

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
	await page.getByRole('button', { name: 'Add mask' }).click();
	assert.equal((await locallab()).Selspot, 1, 'the new mask is selected');
	assert.deepEqual(await page.getByLabel('Mask type').locator('option').allTextContents(), ['Ellipse', 'Rectangle', 'Gradient']);
	await page.getByLabel('Mask type').selectOption('GRADIENT');

	const added = await locallab();
	assert.ok(isGradientMask({ Locallab: added as Record<string, string | number | boolean> }, 1));
	assert.equal(added.Strcol_1, 1, 'a fresh gradient darkens visibly');
	assert.equal(isGradientMask({ Locallab: added as Record<string, string | number | boolean> }, 0), false, 'the other mask stays an ellipse');

	// A gradient offers its own controls and every adjustment the other masks have, but no feather
	for (const label of ['Exposure', 'Colour', 'Angle', 'Feather']) await page.getByLabel(`${label} value`).waitFor();
	assert.equal(await page.getByLabel('Exposure value').count(), 1, 'only the graded exposure');
	assert.equal(await page.getByLabel('Exposure value').inputValue(), '-1', 'a fresh gradient darkens by 1 EV');

	// Exposure reads like exposure: positive brightens, which RawTherapee's gradient writes as negative
	await page.locator('input[type="range"][aria-label="Exposure"]').evaluate((input: HTMLInputElement) => {
		input.value = '-2';
		input.dispatchEvent(new Event('input', { bubbles: true }));
	});
	assert.equal((await locallab()).Strcol_1, 2);
	for (const label of ['Brightness', 'Contrast', 'Saturation']) await page.getByLabel(`${label} value`, { exact: true }).waitFor();
	// A gradient's Feather is the width of its transition, not the edge of a region
	await page.locator('input[type="range"][aria-label="Feather"]').evaluate((input: HTMLInputElement) => {
		input.value = '50';
		input.dispatchEvent(new Event('input', { bubbles: true }));
	});
	const feathered = await locallab();
	assert.equal(feathered.Feathercol_1, 50);
	assert.equal(feathered.Feather_1, 25, 'the region feather is untouched');
	assert.equal(await page.getByRole('button', { name: 'Enable Sharpening' }).count(), 1, 'the per-mask tools are offered too');

	// Colour reads the way it is named: positive is more colourful, which RawTherapee writes as negative
	await page.locator('input[type="range"][aria-label="Colour"]').evaluate((input: HTMLInputElement) => {
		input.value = '1';
		input.dispatchEvent(new Event('input', { bubbles: true }));
	});
	assert.equal((await locallab()).Strcolab_1, -1);

	await page.locator('input[type="range"][aria-label="Angle"]').evaluate((input: HTMLInputElement) => {
		input.value = '30';
		input.dispatchEvent(new Event('input', { bubbles: true }));
	});
	assert.equal((await locallab()).Angcol_1, 30);

	// Dragging the horizon handle moves the gradient's centre
	const handle = page.getByRole('button', { name: 'Move Mask 2' });
	const box = (await handle.boundingBox())!;
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
	await page.mouse.down();
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 - 80, { steps: 5 });
	await page.mouse.up();
	const moved = await locallab();
	assert.ok(Number(moved.CenterY_1) < 0, `the horizon moved up (CenterY ${moved.CenterY_1})`);
	assert.equal(moved.CenterY_0, 0, 'the other mask stays put');

	if (process.env.GRADIENT_PROBE_SHOT) await page.screenshot({ path: process.env.GRADIENT_PROBE_SHOT });

	// Turning it back into an ellipse brings the region controls back and leaves no gradient behind
	await page.getByLabel('Mask type').selectOption('ELI');
	await page.getByLabel('Feather value').waitFor();
	const ellipse = await locallab();
	assert.equal(ellipse.Shape_1, 'ELI');
	assert.equal(ellipse.Strcol_1, 0, 'the gradient is off on a region');
	assert.equal(isGradientMask({ Locallab: ellipse as Record<string, string | number | boolean> }, 1), false);
	// Dehaze has a Strength slider too, so check the controls only a gradient has
	assert.equal(ellipse.Strcolab_1, 0, 'the colour gradient is off on a region too');
	for (const label of ['Colour', 'Angle']) assert.equal(await page.getByLabel(`${label} value`).count(), 0, `${label} belongs to gradients only`);
	assert.deepEqual(errors, []);
	console.log('PASS: the type selector turns a mask into a gradient and back, the gradient offers its own controls plus every mask adjustment, and its horizon drags the centre');
} finally {
	await closeProbe({ browser, server, temporary });
}
