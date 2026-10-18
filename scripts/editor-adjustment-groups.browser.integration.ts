import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { closeProbe, collectPageErrors, createProbeProject, createProbeServer, launchProbeBrowser, listenOnPort, repoRoot, type ProbeBrowser } from './lib/browser-probe';

// Exercise the real adjustment groups and the desktop limit that keeps the
// panel from turning into a wall of open sections.
const temporary = await createProbeProject({ prefix: 'giraf-groups-', tailwind: true });
await writeFile(
	join(temporary, 'App.svelte'),
	`
<script>
 import Section from '${repoRoot}/src/lib/ui/Section.svelte';
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
const server = await createProbeServer(temporary, {
	tailwind: true,
	aliases: [{ find: '$lib/state/editing.svelte', replacement: join(temporary, 'editing.ts') }]
});
let browser: ProbeBrowser | undefined;
try {
	const port = await listenOnPort(server);
	browser = await launchProbeBrowser();
	const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
	const errors = collectPageErrors(page);
	const openGroups = () =>
		page.evaluate(() => Array.from(document.querySelectorAll('details[data-adjustment-group][open]')).map((details) => details.getAttribute('data-adjustment-group')));

	await page.goto(`http://127.0.0.1:${port}/`);
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
	await closeProbe({ browser, server, temporary });
}
