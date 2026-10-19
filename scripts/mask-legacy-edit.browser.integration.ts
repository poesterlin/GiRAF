import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { closeProbe, collectPageErrors, createProbeProject, createProbeServer, launchProbeBrowser, listenOnPort, repoRoot, type ProbeBrowser } from './lib/browser-probe';

// A mask saved before the per-mask tools, the colour range and invert existed has no key for them, and
// every slider in the mask panel binds to one. An undefined binding does not fall back, it stops the
// page from rendering, so this opens the real masks page with the real editor state on such an edit and
// checks that it loads and that the mask gained the settings.
//
// The photo's newest saved version is what the editor loads, so the fixture is a snapshot of an old edit.

const LEGACY_PP3 = `[Exposure]
Enabled=true
Auto=false
Compensation=0.5

[Locallab]
Enabled=true
Selspot=0
Name_0=Mask 1
Isvisible_0=true
Activ_0=true
Shape_0=ELI
SpotMethod_0=norm
ShapeMethod_0=IND
QualityMethod_0=enh
ComplexMethod_0=mod
Loc_0=500;500;500;500;
CenterX_0=0
CenterY_0=0
Transit_0=60
Feather_0=25
Colorscope_0=100
Deltae_0=false
Expcolor_0=true
Complexcolor_0=0
Lightness_0=0
Contrast_0=0
Chroma_0=0
Sensi_0=60
Expexpose_0=true
Complexexpose_0=0
Expcomp_0=0.5
Sensiex_0=100`;

const temporary = await createProbeProject({ prefix: 'giraf-mask-legacy-', tailwind: true });
await writeFile(
	join(temporary, 'App.svelte'),
	`
<script>
 import Masks from '${repoRoot}/src/routes/editor/[img]/masks/+page.svelte';
 import { edits } from '$lib/state/editing.svelte';
 import { parsePP3 } from '$lib/pp3-utils';
 const image = { id: 1, whiteBalance: 5000, tint: 1, importBaseline: null, tifPath: null };
 // The page initializes the editor from the photo's newest saved version
 const data = { image, snapshots: [{ id: 1, createdAt: new Date().toISOString(), pp3: ${JSON.stringify(LEGACY_PP3)} }] };
 window.probe = {
   locallab: () => JSON.parse(JSON.stringify(edits.pp3?.Locallab ?? {})),
   loaded: () => !!edits.pp3,
   parse: (pp3) => parsePP3(pp3)
 };
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
const server = await createProbeServer(temporary, {
	tailwind: true,
	noDiscovery: true,
	aliases: [{ find: /^\$app\/(environment|state|navigation)$/, replacement: join(temporary, 'context.ts') }]
});
type ProbeWindow = Window & { probe: { locallab(): Record<string, unknown>; loaded(): boolean } };
let browser: ProbeBrowser | undefined;
try {
	const port = await listenOnPort(server);
	browser = await launchProbeBrowser();
	const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
	const errors = collectPageErrors(page, { log: true });
	await page.route('**/api/images/*/edit?*', (route) =>
		route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"></svg>' })
	);
	await page.goto(`http://127.0.0.1:${port}`, { waitUntil: 'domcontentloaded' });
	await page.waitForFunction(() => (window as unknown as ProbeWindow).probe?.loaded());

	// The panel has to be there, with the settings that the old edit had no keys for
	await page.getByRole('slider', { name: 'Colour range' }).waitFor();
	await page.getByRole('button', { name: 'Enable Sharpening' }).waitFor();
	await page.getByRole('slider', { name: 'Exposure' }).first().waitFor();
	const locallab = await page.evaluate(() => (window as unknown as ProbeWindow).probe.locallab());
	assert.equal(locallab.Expcomp_0, 0.5, 'the edit keeps the values it had');
	assert.equal(locallab.Feather_0, 25);
	assert.equal(locallab.Sensi_0, 60, 'a narrower colour range is kept');
	assert.equal(locallab.Sharamount_0, 50, 'the tools the mask never used get their defaults');
	assert.equal(locallab.Expsharp_0, false);
	assert.equal(locallab.Invers_0, false);
	assert.deepEqual(errors, []);
	console.log('PASS: an edit saved before the mask settings existed opens the masks page');
} finally {
	await closeProbe({ browser, server, temporary });
}
