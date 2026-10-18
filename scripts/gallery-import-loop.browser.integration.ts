import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { closeProbe, collectPageErrors, createProbeProject, createProbeServer, launchProbeBrowser, listenOnPort, repoRoot, type ProbeBrowser } from './lib/browser-probe';

const temporary = await createProbeProject({ prefix: 'giraf-gallery-loop-', tailwind: false });
await writeFile(
	join(temporary, 'App.svelte'),
	`
<script>
 import Gallery from '${repoRoot}/src/routes/gallery/+page.svelte';
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
const server = await createProbeServer(temporary, {
	tailwind: false,
	noDiscovery: true,
	aliases: [
		{ find: '$app/navigation', replacement: join(temporary, 'navigation.ts') },
		{ find: '$lib/state/app.svelte', replacement: join(temporary, 'app.ts') }
	]
});
let browser: ProbeBrowser | undefined;
try {
	const port = await listenOnPort(server);
	browser = await launchProbeBrowser();
	const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
	const errors = collectPageErrors(page);
	await page.route('**/api/sessions/1/import', async (route) => {
		await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'running' }) });
	});
	await page.route('**/api/sessions?cursor=*', async (route) => {
		await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ sessions: [], next: null }) });
	});
	await page.goto(`http://127.0.0.1:${port}`, { waitUntil: 'networkidle' });
	await page.evaluate(() => window.dispatchEvent(new Event('resize')));
	console.log('CAPTURED_ERRORS:', JSON.stringify(errors));
	assert.deepEqual(errors, [], `Expected zero runtime errors, got: ${errors.join(' | ')}`);
} finally {
	await closeProbe({ browser, server, temporary });
}
