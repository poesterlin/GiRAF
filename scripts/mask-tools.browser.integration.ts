import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { maskTools } from '../src/lib/local-masks';
import { closeProbe, collectPageErrors, createProbeProject, createProbeServer, launchProbeBrowser, listenOnPort, repoRoot, type ProbeBrowser } from './lib/browser-probe';

// Drives the real mask panel: every per-mask tool must appear, its switch must write the tool's
// flag beside the method RawTherapee needs, and moving a slider must turn its tool on.

const temporary = await createProbeProject({ prefix: 'giraf-mask-tools-', tailwind: true });
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
	await page.route('**/api/images/*/edit?*', (route) =>
		route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"></svg>' })
	);
	const locallab = () => page.evaluate(() => (window as unknown as ProbeWindow).probe.locallab());
	const history = () => page.evaluate(() => (window as unknown as ProbeWindow).probe.history());
	const group = (label: string) => page.locator('details').filter({ has: page.getByText(label, { exact: true }) });

	await page.goto(`http://127.0.0.1:${port}`, { waitUntil: 'domcontentloaded' });
	for (const tool of maskTools) await page.getByText(tool.label, { exact: true }).waitFor();

	// A fresh mask has every tool off, with the method each one needs already written
	const fresh = await locallab();
	for (const tool of maskTools) assert.equal(fresh[`${tool.enable}_0`], false, `${tool.label} starts off`);
	assert.equal(fresh.methodcap_0, 'rl');
	assert.equal(fresh.ShMethod_0, 'std');
	assert.equal(fresh.localcontMethod_0, 'loc');
	assert.equal(await page.getByRole('switch', { name: 'Use Sharpening on this mask' }).getAttribute('aria-checked'), 'false');

	// The switch turns a tool on and off without opening the group
	await page.getByRole('switch', { name: 'Use Sharpening on this mask' }).click();
	assert.equal((await locallab()).Expsharp_0, true);
	assert.equal(await page.getByRole('switch', { name: 'Use Sharpening on this mask' }).getAttribute('aria-checked'), 'true');
	assert.equal(await group('Sharpening').getByLabel('Amount value').isVisible(), false, 'the switch must not open the group');
	assert.equal(await history(), 1);
	await page.getByRole('switch', { name: 'Use Sharpening on this mask' }).click();
	assert.equal((await locallab()).Expsharp_0, false);

	// Moving a slider of a tool that is off turns that tool on
	const clarity = group('Clarity');
	await clarity.locator('summary').click();
	await clarity.getByLabel('Radius value').waitFor();
	await clarity.locator('input[type="range"][aria-label="Radius"]').evaluate((input: HTMLInputElement) => {
		input.value = '40';
		input.dispatchEvent(new Event('input', { bubbles: true }));
	});
	const changed = await locallab();
	assert.equal(changed.Lcradius_0, 40);
	assert.equal(changed.Expcontrast_0, true, 'moving a slider enables the tool');
	assert.equal(changed.localcontMethod_0, 'loc');
	assert.equal(changed.Expsharp_0, false, 'another tool must stay off');

	assert.deepEqual(errors, []);
	console.log(`PASS: ${maskTools.length} mask tools render, and the switches and sliders write to the spot`);
} finally {
	await closeProbe({ browser, server, temporary });
}
