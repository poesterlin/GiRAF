import assert from 'node:assert/strict';
import { mkdtemp, writeFile, symlink, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

const root = resolve(import.meta.dir, '..');
const temporary = await mkdtemp(join(tmpdir(), 'giraf-gallery-loop-'));
await symlink(join(root, 'node_modules'), join(temporary, 'node_modules'));
await writeFile(join(temporary, 'index.html'), '<div id="app"></div><script type="module" src="/main.ts"></script>');
await writeFile(join(temporary, 'main.ts'), `import { mount } from 'svelte'; import App from './App.svelte'; mount(App, { target: document.querySelector('#app') });`);
await writeFile(
	join(temporary, 'App.svelte'),
	`
<script>
 import Gallery from '${root}/src/routes/gallery/+page.svelte';
 let data = $state({
  triageEnabled: true,
  next: 10,
  sessions: [{
   id: 1, name: 'Test Session', startedAt: new Date().toISOString(),
   imageCount: 1, isImporting: true, isExporting: false,
   images: [{ id: 1917, isArchived: false, version: 1, hasSnapshot: false, snapshotId: null }]
  }]
 });
</script>
<div style="height: 600px"><Gallery {data} /></div>`
);
await writeFile(join(temporary, 'navigation.ts'), `export const invalidateAll = async () => {};`);
await writeFile(join(temporary, 'app.ts'), `export const app = { addToast: () => {} };`);
const server = await createServer({
	root: temporary,
	configFile: false,
	plugins: [svelte({ configFile: false })],
	optimizeDeps: { noDiscovery: true },
	resolve: {
		alias: [
			{ find: '$app/navigation', replacement: join(temporary, 'navigation.ts') },
			{ find: '$lib/state/app.svelte', replacement: join(temporary, 'app.ts') },
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
	const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	await page.route('**/api/sessions/1/import', async (route) => {
		await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'running' }) });
	});
	await page.route('**/api/sessions?cursor=*', async (route) => {
		await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ sessions: [], next: null }) });
	});
	await page.goto(`http://127.0.0.1:${address.port}`, { waitUntil: 'networkidle' });
	await page.evaluate(() => window.dispatchEvent(new Event('resize')));
	console.log('CAPTURED_ERRORS:', JSON.stringify(errors));
	assert.deepEqual(errors, [], `Expected zero runtime errors, got: ${errors.join(' | ')}`);
} finally {
	await browser?.close();
	await server.close();
	await rm(temporary, { recursive: true, force: true });
}
