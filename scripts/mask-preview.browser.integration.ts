import assert from 'node:assert/strict';
import { mkdtemp, writeFile, symlink, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';

const root = resolve(import.meta.dir, '..');
const temporary = await mkdtemp(join(tmpdir(), 'giraf-mask-preview-'));
await symlink(join(root, 'node_modules'), join(temporary, 'node_modules'));
await writeFile(join(temporary, 'index.html'), '<div id="app"></div><script type="module" src="/main.ts"></script>');
await writeFile(join(temporary, 'fixture.css'), `@import '${root}/src/app.css'; @source '${root}/src';`);
await writeFile(
	join(temporary, 'main.ts'),
	`import './fixture.css'; import { mount } from 'svelte'; import App from './App.svelte'; mount(App, { target: document.querySelector('#app') });`
);
await writeFile(
	join(temporary, 'App.svelte'),
	`
<script>
 import Masks from '${root}/src/routes/editor/[img]/masks/+page.svelte';
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
import { addLocalMask } from '${root}/src/lib/local-masks';
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
const server = await createServer({
	root: temporary,
	configFile: false,
	plugins: [tailwindcss(), svelte({ configFile: false })],
	optimizeDeps: { noDiscovery: true },
	resolve: {
		alias: [
			{ find: '$lib/state/editing.svelte', replacement: join(temporary, 'editing.svelte.ts') },
			{ find: /^\$app\/(environment|state|navigation)$/, replacement: join(temporary, 'context.ts') },
			{ find: '$lib', replacement: join(root, 'src/lib') }
		]
	},
	server: { host: '127.0.0.1', port: 0, fs: { allow: [root, temporary] } }
});
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
try {
	await server.listen();
	const address = server.httpServer!.address() as { port: number };
	browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH });
	const page = await browser.newPage({ viewport: { width: 1280, height: 700 } });
	const errors: string[] = [];
	page.on('pageerror', (error) => {
		errors.push(error.message);
		console.error(error.message);
	});
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
	await page.goto(`http://127.0.0.1:${address.port}`, { waitUntil: 'domcontentloaded' });
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
	await page.evaluate(() => (window as any).refreshPreview());
	await waitPending(2);
	assert.equal(await visibleMasks().isVisible(), true, 'Same-photo updates keep stable mask geometry visible');
	await pending[1].release();
	await page.evaluate(() => (window as any).switchPhoto());
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
	await browser?.close();
	await server.close();
	await rm(temporary, { recursive: true, force: true });
}
