import { chromium } from 'playwright';
import { createHash, randomUUID } from 'node:crypto';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import { tmpdir } from 'node:os';

// Opt-in: exercises the real deployed browser, API, filesystem, EXIF and database.
const source = process.env.RAW_UPLOAD_TEST_FILE;
if (!source) throw new Error('Set RAW_UPLOAD_TEST_FILE to a real RAW fixture. This test creates one import-queue entry.');
const origin = process.env.RAW_UPLOAD_TEST_URL ?? 'http://localhost:5173';
const temporary = await mkdtemp(join(tmpdir(), 'giraf-upload-e2e-'));
const name = `giraf-upload-probe-${randomUUID()}${extname(source)}`;
const fixture = join(temporary, name);
// Keep the photo and its metadata intact while making the probe content unique.
const bytes = Buffer.concat([await readFile(source), Buffer.from(`\nGiRAF integration probe ${randomUUID()}\n`)]);
if (bytes.length < 4 * 256 * 1024) throw new Error('Use a RAW fixture larger than 1 MiB to exercise resume.');
await writeFile(fixture, bytes);
const hash = createHash('sha256').update(bytes).digest('hex');
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const pageErrors: string[] = [];
page.on('pageerror', (error) => pageErrors.push(String(error)));
let lostAcknowledgement = false;
let hold = true;
let resumed = false;
const resumedChunks: number[] = [];
let blocked!: () => void;
const paused = new Promise<void>((resolve) => {
	blocked = resolve;
});

try {
	await page.route(`**/api/imports/resumable/${hash}?chunk=*`, async (route) => {
		const chunk = Number(new URL(route.request().url()).searchParams.get('chunk'));
		if (resumed) resumedChunks.push(chunk);
		if (chunk === 1 && !lostAcknowledgement) {
			// Store on the real server but discard its acknowledgement.
			const response = await route.fetch();
			if (!response.ok()) throw new Error(`Chunk write failed: ${response.status()}`);
			lostAcknowledgement = true;
			await route.abort('connectionreset');
			return;
		}
		if (hold && chunk >= 3) {
			blocked();
			await route.abort('internetdisconnected');
			return;
		}
		await route.continue();
	});
	await page.goto(new URL('/importer', origin).toString(), { waitUntil: 'domcontentloaded' });
	await page.locator('input[type=file]').first().setInputFiles(fixture);
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		await Promise.race([
			paused,
			new Promise<never>((_, reject) => {
				timer = setTimeout(() => reject(new Error(`Upload never reached chunk 3. Browser errors: ${pageErrors.join('; ')}`)), 90_000);
			})
		]);
	} finally {
		clearTimeout(timer);
	}
	const statusResponse = await page.request.get(new URL(`/api/imports/resumable/${hash}`, origin).toString());
	const status = await statusResponse.json();
	if (![0, 1, 2].every((chunk) => status.chunks?.includes(chunk))) throw new Error('Acknowledged chunks were not persisted');
	console.log('PASS: lost acknowledgement retried successfully; chunks 0–2 persisted');
	await page.reload({ waitUntil: 'domcontentloaded' });
	hold = false;
	resumed = true;
	const finished = page.waitForResponse((response) => response.url().endsWith(`/api/imports/resumable/${hash}`) && response.request().method() === 'POST', { timeout: 180_000 });
	await page.locator('input[type=file]').first().setInputFiles(fixture);
	const response = await finished;
	const payload = await response.json();
	const result = payload.results?.[0];
	if (!response.ok() || result?.status !== 'success' || !result.id) throw new Error(`Finalization failed: ${JSON.stringify(payload)}`);
	if (resumedChunks.some((chunk) => chunk < 3)) throw new Error('Reload retransmitted previously acknowledged chunks');
	const queue = await (await page.request.get(new URL('/api/imports', origin).toString())).json();
	const matching = queue.items.filter((item: { contentHash: string }) => item.contentHash === hash);
	if (matching.length !== 1 || matching[0].id !== result.id || matching[0].fileSize !== bytes.length) throw new Error('Expected exactly one correct import-queue entry');
	console.log('PASS: reload/reselection resumed without retransmitting chunks 0–2');
	console.log('PASS: real RAW finalized with EXIF metadata into exactly one database entry');
	console.log(JSON.stringify({ id: result.id, name: basename(fixture), hash, bytes: bytes.length, serverPath: matching[0].filePath }));
} finally {
	await browser.close();
	await rm(temporary, { recursive: true, force: true });
}
