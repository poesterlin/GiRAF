import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { fromBase64, parsePP3, stringifyPP3 } from '../src/lib/pp3-utils';
import { closeProbe, collectPageErrors, createProbeProject, createProbeServer, launchProbeBrowser, listenOnPort, repoRoot, type ProbeBrowser } from './lib/browser-probe';

// Drives the real crop page with previews rendered by the real RawTherapee in the editor container, and
// checks that straightening and perspective preview immediately on the canvas, then match RawTherapee's
// own render once the server's settled preview arrives.
//
// Usage: CROP_PROBE_CONTAINER=<editor container> CROP_PROBE_TIFF=/app/tmp/<photo>.tif bun scripts/crop-perspective.browser.integration.ts
const container = process.env.CROP_PROBE_CONTAINER;
const tiff = process.env.CROP_PROBE_TIFF;
if (!container || !tiff) throw new Error('Set CROP_PROBE_CONTAINER and CROP_PROBE_TIFF');

let renders = 0;
/** Renders a profile with RawTherapee inside the container and returns the PNG. */
async function render(pp3: string): Promise<Buffer> {
	const name = `/tmp/crop-probe-${process.pid}-${renders++}`;
	await writeFile(`${name}.pp3`, pp3);
	const run = (args: string[]) => {
		const result = Bun.spawnSync(args);
		if (result.exitCode !== 0) throw new Error(`${args.join(' ')} failed: ${result.stderr}`);
	};
	run(['docker', 'cp', `${name}.pp3`, `${container}:${name}.pp3`]);
	run(['docker', 'exec', container, '/opt/rawtherapee/usr/bin/rawtherapee-cli', '--no-gui', '-p', `${name}.pp3`, '-q', '-o', `${name}.png`, '-n', '-b8', '-Y', '-c', tiff!]);
	run(['docker', 'cp', `${container}:${name}.png`, `${name}.png`]);
	run(['docker', 'exec', container, 'rm', '-f', `${name}.pp3`, `${name}.png`]);
	return Bun.file(`${name}.png`)
		.arrayBuffer()
		.then((buffer) => Buffer.from(buffer));
}

const temporary = await createProbeProject({ prefix: 'giraf-crop-perspective-', tailwind: true });
await writeFile(
	join(temporary, 'App.svelte'),
	`
<script>
 import Crop from '${repoRoot}/src/routes/editor/[img]/crop/+page.svelte';
 let data = $state({ image: { id: 1 }, snapshots: [] });
</script>
<div class="h-[900px]"><Crop {data} /></div>`
);
await writeFile(
	join(temporary, 'context.ts'),
	`
export const browser = true;
export const beforeNavigate = () => {};
export const page = { url: new URL('http://localhost/editor/1/crop'), params: { img: '1' }, data: {} };
`
);
await writeFile(
	join(temporary, 'editing.svelte.ts'),
	`
import { parsePP3 } from '${repoRoot}/src/lib/pp3-utils';
import base from '${repoRoot}/src/lib/assets/client.pp3?raw';
class Edits {
 pp3 = $state(parsePP3(base));
 currentImageId = $state('1');
 isLoading = false; hasChanges = false; canUndo = false; canRedo = false;
 // The page's previews follow the edit without the editor's throttling
 get throttledPP3() { return this.pp3; }
 initialize() {}
 pushHistory() {}
 undo() {}
 redo() {}
}
export const edits = new Edits();
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

let browser: ProbeBrowser | undefined;
try {
	const port = await listenOnPort(server);
	browser = await launchProbeBrowser();
	const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
	const errors = collectPageErrors(page, { log: true });
	const previews: string[] = [];
	await page.route('**/api/images/*/details', (route) => route.fulfill({ json: { resolutionX: 1000, resolutionY: 667 } }));
	await page.route('**/api/images/*/edit?*', async (route) => {
		const config = fromBase64(new URL(route.request().url()).searchParams.get('config')!);
		previews.push(config);
		await route.fulfill({ contentType: 'image/png', body: await render(config) });
	});

	const setSlider = (label: string, value: number) =>
		page.locator(`input[type="range"][aria-label="${label}"]`).evaluate((input: HTMLInputElement, value) => {
			input.value = String(value);
			input.dispatchEvent(new Event('input', { bubbles: true }));
			input.dispatchEvent(new Event('change', { bubbles: true }));
		}, value);
	const sliderValue = (label: string) => page.locator(`input[type="range"][aria-label="${label}"]`).inputValue().then(Number);
	const previewSource = () => page.locator('canvas').getAttribute('data-preview-source');

	/** Waits until the preview for the current settings has been drawn, then returns the photo area of the canvas. */
	async function canvasPhoto(wait = 300): Promise<{ data: Buffer; width: number; height: number }> {
		await page.waitForFunction(() => {
			const image = document.querySelector('img.hidden') as HTMLImageElement | null;
			return image?.complete && image.naturalWidth > 0;
		});
		await page.waitForTimeout(wait);
		const url = await page.locator('canvas').evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL('image/png'));
		const png = Buffer.from(url.split(',')[1], 'base64');
		const { width, height } = await sharp(png).metadata();
		const padding = 24;
		const photo = { left: padding, top: padding, width: width! - padding * 2, height: height! - padding * 2 };
		return { data: await sharp(png).extract(photo).removeAlpha().raw().toBuffer(), width: photo.width, height: photo.height };
	}

	/** Waits for the debounced server render with the given geometry, then for it to be on the canvas. */
	async function waitForRendered(matches: (settings: ReturnType<typeof parsePP3>) => boolean) {
		const deadline = Date.now() + 30_000;
		while (Date.now() < deadline && !previews.some((preview) => matches(parsePP3(preview)))) await page.waitForTimeout(50);
		await page.waitForFunction(
			() => {
				const image = document.querySelector('img[data-rendered-preview]') as HTMLImageElement | null;
				return !!image && image.complete && image.naturalWidth > 0;
			},
			null,
			{ timeout: 30_000 }
		);
		await page.waitForFunction(() => document.querySelector('canvas')?.getAttribute('data-preview-source') === 'rendered');
		await page.waitForTimeout(50);
	}

	/** RawTherapee's render of the page's current geometry, uncropped, at the canvas size. */
	async function reference(width: number, height: number): Promise<Buffer> {
		const settings = parsePP3(previews.at(-1)!);
		const degree = await sliderValue('Straighten');
		settings.Rotation = { ...settings.Rotation, Degree: degree };
		settings.Perspective = {
			...settings.Perspective,
			Method: 'simple',
			Vertical: await sliderValue('Vertical'),
			Horizontal: await sliderValue('Horizontal')
		};
		return sharp(await render(stringifyPP3(settings)))
			.resize(width, height, { fit: 'fill' })
			.removeAlpha()
			.raw()
			.toBuffer();
	}
	const difference = (a: Buffer, b: Buffer) => a.reduce((sum, value, i) => sum + Math.abs(value - b[i]), 0) / a.length;

	await page.goto(`http://127.0.0.1:${port}`, { waitUntil: 'domcontentloaded' });
	for (const label of ['Straighten', 'Vertical', 'Horizontal']) await page.locator(`input[type="range"][aria-label="${label}"]`).waitFor();
	await page.waitForTimeout(300);

	// Drag first: the canvas answers immediately with the local warp, before the server render starts.
	const beforeStraighten = previews.length;
	await setSlider('Straighten', 5);
	await page.waitForTimeout(100);
	assert.equal(previews.length, beforeStraighten, 'straightening is previewed on the device while it changes');
	assert.equal(await previewSource(), 'local');
	const straightenedLocal = await canvasPhoto(20);
	assert.ok(!parsePP3(previews.at(-1)!).Rotation, 'the flat preview has no rotation');
	const straightenedLocalError = difference(straightenedLocal.data, await reference(straightenedLocal.width, straightenedLocal.height));

	// Once the edit settles the server's render replaces the approximation.
	await waitForRendered((settings) => Number(settings.Rotation?.Degree) === 5);
	assert.equal(await previewSource(), 'rendered');
	const straightenedRendered = await canvasPhoto(50);
	const straightenedRenderedError = difference(straightenedRendered.data, await reference(straightenedRendered.width, straightenedRendered.height));

	// Perspective follows the same path: local while the sliders move, exact once they stop.
	const beforePerspective = previews.length;
	await setSlider('Vertical', 30);
	await setSlider('Horizontal', 20);
	await page.waitForTimeout(100);
	assert.equal(previews.length, beforePerspective, 'perspective is previewed on the device while it changes');
	assert.equal(await previewSource(), 'local');
	const correctedLocal = await canvasPhoto(20);
	const correctedLocalError = difference(correctedLocal.data, await reference(correctedLocal.width, correctedLocal.height));

	await waitForRendered((settings) => Number(settings.Perspective?.Vertical) === 30 && Number(settings.Perspective?.Horizontal) === 20);
	assert.equal(await previewSource(), 'rendered');
	const correctedRendered = await canvasPhoto(50);
	const correctedRenderedError = difference(correctedRendered.data, await reference(correctedRendered.width, correctedRendered.height));

	// The opposite tilt exercises the signs of both perspective axes.
	const beforeNegative = previews.length;
	await setSlider('Straighten', -5);
	await setSlider('Vertical', -30);
	await setSlider('Horizontal', -15);
	await page.waitForTimeout(100);
	assert.equal(previews.length, beforeNegative, 'negative perspective is previewed on the device while it changes');
	assert.equal(await previewSource(), 'local');
	const negativeLocal = await canvasPhoto(20);
	const negativeLocalError = difference(negativeLocal.data, await reference(negativeLocal.width, negativeLocal.height));

	await waitForRendered(
		(settings) => Number(settings.Perspective?.Vertical) === -30 && Number(settings.Perspective?.Horizontal) === -15 && Number(settings.Rotation?.Degree) === -5
	);
	assert.equal(await previewSource(), 'rendered');
	const negativeRendered = await canvasPhoto(50);
	const negativeRenderedError = difference(negativeRendered.data, await reference(negativeRendered.width, negativeRendered.height));

	console.log(`local vs RawTherapee: straighten ${straightenedLocalError.toFixed(2)}, perspective ${correctedLocalError.toFixed(2)}, reversed ${negativeLocalError.toFixed(2)}`);
	console.log(
		`rendered vs RawTherapee: straighten ${straightenedRenderedError.toFixed(2)}, perspective ${correctedRenderedError.toFixed(2)}, reversed ${negativeRenderedError.toFixed(2)}`
	);
	for (const error of [straightenedLocalError, correctedLocalError, negativeLocalError, straightenedRenderedError, correctedRenderedError, negativeRenderedError]) {
		assert.ok(error < 4, 'the preview matches RawTherapee');
	}

	if (process.env.CROP_PROBE_SHOT) {
		await page.getByRole('button', { name: 'Start crop' }).click();
		await page.waitForTimeout(300);
		await page.screenshot({ path: process.env.CROP_PROBE_SHOT });
	}
	assert.deepEqual(errors, []);
	console.log('PASS: the crop canvas previews geometry locally, then shows the settled RawTherapee render');
} finally {
	await closeProbe({ browser, server, temporary });
}
