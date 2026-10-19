import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { fromBase64, parsePP3, stringifyPP3 } from '../src/lib/pp3-utils';
import { closeProbe, collectPageErrors, createProbeProject, createProbeServer, launchProbeBrowser, listenOnPort, repoRoot, type ProbeBrowser } from './lib/browser-probe';

// Drives the real mask panel and page with previews rendered by RawTherapee in the editor container. Moving
// the colour range slider must show the range on the photo, and that prediction must match what
// RawTherapee then changes. Inverting must write every tool's invert setting and hide the tools that can't.
//
// Usage: MASK_PROBE_CONTAINER=<editor container> MASK_PROBE_TIFF=/app/tmp/<photo>.tif bun scripts/mask-colour-range.browser.integration.ts
const container = process.env.MASK_PROBE_CONTAINER;
const tiff = process.env.MASK_PROBE_TIFF;
if (!container || !tiff) throw new Error('Set MASK_PROBE_CONTAINER and MASK_PROBE_TIFF');

let renders = 0;
async function render(pp3: string): Promise<Buffer> {
	const name = `/tmp/mask-probe-${process.pid}-${renders++}`;
	await writeFile(`${name}.pp3`, pp3);
	const run = (args: string[]) => {
		const result = Bun.spawnSync(args);
		if (result.exitCode !== 0) throw new Error(`${args.join(' ')} failed: ${result.stderr}`);
	};
	run(['docker', 'cp', `${name}.pp3`, `${container}:${name}.pp3`]);
	run(['docker', 'exec', container, 'rawtherapee-cli', '--no-gui', '-p', `${name}.pp3`, '-q', '-o', `${name}.png`, '-n', '-b8', '-Y', '-c', tiff!]);
	run(['docker', 'cp', `${container}:${name}.png`, `${name}.png`]);
	run(['docker', 'exec', container, 'rm', '-f', `${name}.pp3`, `${name}.png`]);
	return Buffer.from(await Bun.file(`${name}.png`).arrayBuffer());
}

const temporary = await createProbeProject({ prefix: 'giraf-mask-range-', tailwind: true });
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
import { addLocalMask, maskTools, setMaskToolEnabled } from '${repoRoot}/src/lib/local-masks';
const settings = { Locallab: { Enabled: true } };
addLocalMask(settings, 'ELI');
// A wide ellipse centred in the sky that reaches down into the hills, brightening by 1 EV
Object.assign(settings.Locallab, { Loc_0: '800;800;700;700;', CenterY_0: -300, Expcomp_0: 1 });
for (const tool of maskTools) setMaskToolEnabled(settings, 0, tool, true);
let history = 0;
export const edits = $state({
 pp3: settings, throttledPP3: structuredClone(settings), effectivePP3: settings,
 hasChanges: false, canUndo: false, canRedo: false,
 initialize: (_, image) => { edits.currentImageId = String(image.id); },
 updateThrottledPP3: () => {}, pushHistory: () => { history += 1; }, snapshot: async () => {},
 undo: () => {}, redo: () => {}
});
window.probe = { locallab: () => JSON.parse(JSON.stringify(edits.pp3.Locallab)) };
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
type ProbeWindow = Window & { probe: { locallab(): Record<string, unknown> } };

let browser: ProbeBrowser | undefined;
try {
	const port = await listenOnPort(server);
	browser = await launchProbeBrowser();
	const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
	const errors = collectPageErrors(page, { log: true });
	await page.route('**/api/images/*/edit?*', async (route) => {
		const config = fromBase64(new URL(route.request().url()).searchParams.get('config')!);
		await route.fulfill({ contentType: 'image/png', body: await render(config) });
	});
	const locallab = () => page.evaluate(() => (window as unknown as ProbeWindow).probe.locallab());
	await page.goto(`http://127.0.0.1:${port}`, { waitUntil: 'domcontentloaded' });
	await page.getByLabel('Colour range value').waitFor();

	// Moving the slider writes every tool's scope and shows the range on the photo
	await page.locator('input[type="range"][aria-label="Colour range"]').evaluate((input: HTMLInputElement) => {
		input.value = '20';
		input.dispatchEvent(new Event('input', { bubbles: true }));
	});
	const settings = await locallab();
	for (const key of ['Sensi', 'Sensiex', 'Sensiv', 'sensihs', 'Sensih', 'Sensisha', 'Sensilc']) assert.equal(settings[`${key}_0`], 20, key);
	const overlay = page.locator('canvas[aria-hidden="true"]');
	await overlay.waitFor({ timeout: 20_000 });
	await page.waitForTimeout(200);
	if (process.env.MASK_PROBE_SHOT) await page.screenshot({ path: process.env.MASK_PROBE_SHOT });
	const alphaUrl = await overlay.evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL('image/png'));
	const predicted = await sharp(Buffer.from(alphaUrl.split(',')[1], 'base64'))
		.ensureAlpha()
		.extractChannel(3)
		.raw()
		.toBuffer({ resolveWithObject: true });
	const { width, height } = predicted.info;

	// What RawTherapee actually changes with these settings, at the overlay's size
	const pp3 = parsePP3(stringifyPP3({ Locallab: settings as Record<string, string | number | boolean> }));
	const off = parsePP3(stringifyPP3(pp3));
	off.Locallab.Enabled = false;
	const luminance = async (png: Buffer) => sharp(png).resize(width, height, { fit: 'fill' }).greyscale().raw().toBuffer();
	const [masked, plain] = await Promise.all([luminance(await render(stringifyPP3(pp3))), luminance(await render(stringifyPP3(off)))]);
	let error = 0;
	let counted = 0;
	let agree = 0;
	for (let i = 0; i < width * height; i++) {
		const linear = (v: number) => ((v / 255 + 0.055) / 1.055) ** 2.4;
		if (plain[i] < 30) continue; // too dark to measure a brightening
		const actual = Math.max(0, Math.min(1, Math.log2(linear(masked[i]) / linear(plain[i])) / 1.1));
		const weight = (0.72 - predicted.data[i] / 255) / 0.52;
		error += Math.abs(actual - weight);
		if (actual > 0.5 === weight > 0.5) agree++;
		counted++;
	}
	console.log(
		`overlay vs RawTherapee at colour range 20: mean difference ${(error / counted).toFixed(2)}, same side of half in ${((100 * agree) / counted).toFixed(1)}% of ${counted} pixels`
	);
	assert.ok(error / counted < 0.15, 'the overlay predicts what RawTherapee changes');

	// Inverting writes every invert setting and drops the tools that can't follow
	await page.getByText('Invert', { exact: true }).click();
	const inverted = await locallab();
	for (const key of ['Invers', 'Inversex', 'Inverssh', 'Inversret', 'Inverssha']) assert.equal(inverted[`${key}_0`], true, key);
	assert.equal(inverted.Expvibrance_0, false, 'Warm & colour is switched off');
	assert.equal(inverted.Expcontrast_0, false, 'Clarity is switched off');
	assert.equal(await page.getByRole('button', { name: 'Enable Warm & colour' }).count(), 0);
	assert.equal(await page.getByRole('button', { name: 'Enable Clarity' }).count(), 0);
	assert.equal(await page.getByRole('button', { name: 'Enable Sharpening' }).count(), 1);

	assert.deepEqual(errors, []);
	console.log('PASS: the colour range shows on the photo as RawTherapee applies it, and invert sets every tool');
} finally {
	await closeProbe({ browser, server, temporary });
}
