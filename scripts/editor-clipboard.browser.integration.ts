import assert from 'node:assert/strict';
import { mkdtemp, writeFile, symlink, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// Mount the real toolbar twice, as the responsive editor does. Only the editor
// state and SvelteKit context are stubbed; clipboard handling and dialogs are real.
const root = resolve(import.meta.dir, '..');
const temporary = await mkdtemp(join(tmpdir(), 'giraf-clipboard-'));
await symlink(join(root, 'node_modules'), join(temporary, 'node_modules'));
await writeFile(join(temporary, 'index.html'), '<div id="app"></div><script type="module" src="/main.ts"></script>');
await writeFile(join(temporary, 'main.ts'), `import { mount } from 'svelte'; import App from './App.svelte'; mount(App, { target: document.querySelector('#app') });`);
await writeFile(
	join(temporary, 'App.svelte'),
	`
<script>
 import EditModeNav from '${root}/src/lib/ui/EditModeNav.svelte';
</script>
<div class="desktop"><EditModeNav img="1" showClipboard /></div>
<div class="mobile"><EditModeNav img="1" showClipboard showHistory showUndoRedo={false} /></div>
<input aria-label="Typing field" />
<style>
 .mobile { display: none; }
 @media (max-width: 1023px) { .desktop { display: none; } .mobile { display: block; } }
 :global(dialog) { width: min(500px, calc(100vw - 40px)); background: white; }
 :global(button) { padding: 12px; }
</style>`
);
await writeFile(
	join(temporary, 'context.ts'),
	`
export const browser = true;
export const page = { url: new URL('http://localhost/editor/1'), data: { image: { id: '1' } } };
export const beforeNavigate = () => {};
export const invalidateAll = async () => {};
`
);
await writeFile(
	join(temporary, 'editing.ts'),
	`
export const edits = {
 currentImageId: '1', pp3: { Crop: { Enabled: true, W: 100, H: 100 } },
 serialize: () => '[Crop]\\nEnabled=true\\nW=100\\nH=100\\n',
 reset: (...args) => { window.applied = args; }, canUndo: false, canRedo: false
};
`
);
const server = await createServer({
	root: temporary,
	configFile: false,
	plugins: [svelte({ configFile: false })],
	resolve: {
		alias: [
			{ find: '$lib/state/editing.svelte', replacement: join(temporary, 'editing.ts') },
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
	const page = await browser.newPage();
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	await page.addInitScript(() => {
		localStorage.setItem('giraf_pp3_clipboard', '[Crop]\nEnabled=true\nW=100\nH=100\n');
		Object.defineProperty(navigator, 'clipboard', { value: { readText: async () => localStorage.getItem('giraf_pp3_clipboard'), writeText: async () => {} } });
	});
	for (const width of [1280, 390]) {
		await page.setViewportSize({ width, height: 850 });
		await page.goto(`http://127.0.0.1:${address.port}`);
		await page.locator('nav').first().waitFor({ state: 'attached' });
		await page.locator('body').click({ position: { x: 5, y: 800 } });
		await page.keyboard.press('v');
		await page.getByText('Crop when pasting settings').first().waitFor({ state: 'attached' });
		assert.equal(await page.locator('dialog:modal').count(), 1, `${width}px: paste must open exactly one modal`);
		const dialog = page.locator('dialog:modal');
		await dialog.getByRole('checkbox').check();
		assert.equal(await dialog.getByRole('checkbox').isChecked(), true);
		await dialog.getByRole('checkbox').uncheck();
		await dialog.getByRole('button', { name: 'Keep current crop' }).click({ timeout: 2000 });
		await dialog.waitFor({ state: 'detached' });
		assert.equal(await page.evaluate(() => (window as any).applied?.[0]?.Crop?.W), 100);
		// Typing and keys inside dialogs must not trigger another global paste.
		await page.getByLabel('Typing field').fill('v');
		await page.getByLabel('Typing field').press('v');
		assert.equal(await page.locator('dialog:modal').count(), 0);
		await page.locator('body').click({ position: { x: 5, y: 800 } });
		await page.keyboard.press('v');
		await page.locator('dialog:modal').waitFor();
		await page.keyboard.press('v');
		assert.equal(await page.locator('dialog:modal').count(), 1);
		await page.locator('dialog:modal').getByRole('button', { name: 'Apply copied crop' }).click({ timeout: 2000 });
		await page.locator('dialog:modal').waitFor({ state: 'detached' });
		console.log(`PASS: ${width}px paste dialog, checkbox, both choices and shortcut isolation`);
	}
	assert.deepEqual(errors, []);
} finally {
	await browser?.close();
	await server.close();
	await rm(temporary, { recursive: true, force: true });
}
