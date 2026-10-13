import assert from 'node:assert/strict';
import { mkdtemp, writeFile, symlink, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';

// Exercise the real adjustment groups and the desktop limit that keeps the
// panel from turning into a wall of open sections.
const root = resolve(import.meta.dir, '..');
const temporary = await mkdtemp(join(tmpdir(), 'giraf-groups-'));
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
 import Section from '${root}/src/lib/ui/Section.svelte';
 import { limitExpandedGroups } from '$lib/ui/adjustment-expansion';
 const sections = ['Light', 'Colour', 'Detail', 'Grain', 'Vignette', 'Mask'];
</script>
<section data-adjustment-sections use:limitExpandedGroups class="w-[380px]">
 {#each sections as section (section)}
  <Section title={section} section={section} groupId={section} showToggle={false}>
   <p>{section} content</p>
  </Section>
 {/each}
</section>`
);
await writeFile(
	join(temporary, 'editing.ts'),
	`
export const edits = {
 pp3: { Light: {}, Colour: {}, Detail: {}, Grain: {}, Vignette: {}, Mask: {} },
 pushHistory: () => {}
};
`
);
const server = await createServer({
	root: temporary,
	configFile: false,
	plugins: [tailwindcss(), svelte({ configFile: false })],
	resolve: {
		alias: [
			{ find: '$lib/state/editing.svelte', replacement: join(temporary, 'editing.ts') },
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
	const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	const openGroups = () =>
		page.evaluate(() => Array.from(document.querySelectorAll('details[data-adjustment-group][open]')).map((details) => details.getAttribute('data-adjustment-group')));

	await page.goto(`http://127.0.0.1:${address.port}/`);
	await page.locator('details[data-adjustment-group]').first().waitFor();
	assert.deepEqual(await openGroups(), []);

	// A fifth group closes the oldest one instead of stacking up.
	for (const group of ['Light', 'Colour', 'Detail', 'Grain', 'Vignette']) {
		await page.getByText(group, { exact: true }).click();
	}
	assert.deepEqual(await openGroups(), ['Colour', 'Detail', 'Grain', 'Vignette']);

	// Reopening an already open group closes it again.
	await page.getByText('Colour', { exact: true }).click();
	assert.deepEqual(await openGroups(), ['Detail', 'Grain', 'Vignette']);

	// Narrow screens keep the accordion behaviour of one open group at a time.
	await page.setViewportSize({ width: 390, height: 900 });
	for (const group of ['Light', 'Mask']) {
		await page.getByText(group, { exact: true }).click();
	}
	assert.deepEqual(await openGroups(), ['Mask']);
	assert.deepEqual(errors, []);
	console.log('PASS: desktop keeps the last four groups open, mobile keeps one at a time');
} finally {
	await browser?.close();
	await server.close();
	await rm(temporary, { recursive: true, force: true });
}
