#!/usr/bin/env bun
/**
 * Load benchmark for the editor preview. It replays what a user does while editing one photo: drag a
 * slider (a run of quick previews, one at a time like the editor), let it settle (one detailed render),
 * and sometimes open a panel full of thumbnail tiles (film looks, versions) at the same moment.
 *
 * The edit starts small and gets heavier stage by stage (tone, colour, noise reduction, masks), so the
 * report shows how each kind of setting and each burst of tiles affects how long the user waits.
 *
 * Usage:
 *   bun scripts/editor-load-benchmark.ts --url https://raw.example.com --image 1866
 *   bun scripts/editor-load-benchmark.ts --image 1866 --replay      # replay the photo's saved versions
 *
 * Options:
 *   --url      Server to test (default http://localhost:3000)
 *   --image    Photo ID to edit (required). Nothing is saved: the benchmark only requests renders.
 *   --drags    Quick previews per slider drag (default 8)
 *   --tiles    Thumbnail tiles per burst, like an open film-look picker (default 36, 0 to skip bursts)
 *   --replay   Use the photo's saved versions, oldest first, as the stages instead of synthetic ones
 *   --json     Also write the raw measurements to this file
 *
 * GIRAF_COOKIE and GIRAF_TOKEN are forwarded when a proxy in front of the server needs them.
 */
import { parseArgs } from 'node:util';
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { parsePP3, stringifyPP3, toBase64, type PP3 } from '../src/lib/pp3-utils';
import { addLocalMask } from '../src/lib/local-masks';

const { values } = parseArgs({
	options: {
		url: { type: 'string', default: 'http://localhost:3000' },
		image: { type: 'string' },
		drags: { type: 'string', default: '8' },
		tiles: { type: 'string', default: '36' },
		replay: { type: 'boolean', default: false },
		json: { type: 'string' }
	}
});

if (!values.image) {
	console.error('Usage: bun scripts/editor-load-benchmark.ts --image <id> [--url <server>] [--drags 8] [--tiles 36] [--replay] [--json out.json]');
	process.exit(1);
}

const base = values.url!.replace(/\/$/, '');
const imageId = values.image;
const drags = Math.max(1, Number(values.drags));
const tiles = Math.max(0, Number(values.tiles));
// One client ID per run, like one open editor tab
const client = randomUUID();

function headers(extra: Record<string, string> = {}) {
	const result: Record<string, string> = { ...extra };
	if (process.env.GIRAF_COOKIE) result.cookie = process.env.GIRAF_COOKIE;
	if (process.env.GIRAF_TOKEN) result.authorization = `Bearer ${process.env.GIRAF_TOKEN}`;
	return result;
}

type Timed = { ms: number; status: number; render?: number };

/** Requests that take longer than this count as failed, so one stuck render can't stall the run. */
const TIMEOUT_MS = 120_000;

async function timedGet(path: string): Promise<Timed> {
	const started = performance.now();
	try {
		const response = await fetch(base + path, { headers: headers({ 'X-Preview-Client': client }), signal: AbortSignal.timeout(TIMEOUT_MS) });
		await response.arrayBuffer();
		const render = response.headers.get('server-timing')?.match(/render;dur=([\d.]+)/)?.[1];
		return { ms: performance.now() - started, status: response.status, render: render ? Number(render) : undefined };
	} catch {
		return { ms: performance.now() - started, status: 0 };
	}
}

const editUrl = (settings: PP3, query: string) => `/api/images/${imageId}/edit?${query}&config=${encodeURIComponent(toBase64(settings))}`;

/**
 * Every request nudges exposure by a hair more than the last, so each is a new render rather than a
 * hit in the server's preview cache. The random start keeps separate runs apart too.
 */
let nudges = Math.floor(Math.random() * 1000);
function nudged(settings: PP3): PP3 {
	const copy = structuredClone(settings);
	copy.Exposure = { ...copy.Exposure, Compensation: Number(copy.Exposure?.Compensation ?? 0) + 0.00001 * ++nudges };
	return copy;
}

type Stage = { name: string; settings: PP3 };

async function loadSnapshots(): Promise<{ pp3: string; createdAt: string }[]> {
	const response = await fetch(`${base}/api/images/${imageId}/snapshots`, { headers: headers() });
	if (!response.ok) throw new Error(`Could not load versions of photo ${imageId}: HTTP ${response.status}`);
	const snapshots = (await response.json()) as { pp3: string; createdAt: string }[];
	return snapshots.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** Starts from the photo's oldest version (its import) and adds heavier settings one stage at a time. */
function syntheticStages(start: PP3): Stage[] {
	const stages: Stage[] = [];
	const add = (name: string, change: (settings: PP3) => void) => {
		const settings = structuredClone(stages.at(-1)?.settings ?? start);
		change(settings);
		stages.push({ name, settings });
	};
	add('1 light', (s) => {
		s.Exposure = { ...s.Exposure, Compensation: 0.3, Contrast: 10 };
	});
	add('2 + tone & colour', (s) => {
		s.Local_Contrast = { ...s.Local_Contrast, Enabled: true, Radius: 80, Amount: 0.2, Darkness: 1, Lightness: 1 };
		s.Dehaze = { ...s.Dehaze, Enabled: true, Strength: 20, Depth: 25 };
		s.Vibrance = { ...s.Vibrance, Enabled: true, Pastels: 20, Saturated: 10 };
		s['Shadows_&_Highlights'] = { ...s['Shadows_&_Highlights'], Enabled: true, Highlights: 20, Shadows: 20 };
	});
	add('3 + noise reduction', (s) => {
		s.Directional_Pyramid_Denoising = { ...s.Directional_Pyramid_Denoising, Enabled: true, Luma: 30, Chroma: 15 };
	});
	add('4 + one mask', (s) => {
		const index = addLocalMask(s, 'RECT');
		s.Locallab[`Expcomp_${index}`] = 0.5;
	});
	add('5 + three masks', (s) => {
		for (const shape of ['ELI', 'RECT'] as const) {
			const index = addLocalMask(s, shape);
			s.Locallab[`Expcomp_${index}`] = -0.3;
			s.Locallab[`Chroma_${index}`] = 10;
		}
	});
	return stages;
}

function replayStages(snapshots: { pp3: string }[]): Stage[] {
	// Keep the run short: at most eight evenly spaced versions, always including the first and last
	const count = Math.min(8, snapshots.length);
	const picks = [...new Set(Array.from({ length: count }, (_, i) => Math.round((i * (snapshots.length - 1)) / Math.max(1, count - 1))))];
	return picks.map((index) => ({ name: `version ${index + 1}/${snapshots.length}`, settings: parsePP3(snapshots[index].pp3) }));
}

type Result = { stage: string; load: 'idle' | 'tiles'; quick: Timed[]; final?: Timed; tilesMs?: number; tileErrors?: number };

async function runStage(stage: Stage, load: Result['load']): Promise<Result> {
	let tilesDone: Promise<{ ms: number; errors: number }> | undefined;
	if (load === 'tiles') {
		const started = performance.now();
		// A panel full of tiles: every tile is its own request, all at once, as the browser loads them
		tilesDone = Promise.all(Array.from({ length: tiles }, () => timedGet(editUrl(nudged(stage.settings), 'preview&size=480')))).then((results) => ({
			ms: performance.now() - started,
			errors: results.filter((r) => r.status !== 200).length
		}));
	}
	const quick: Timed[] = [];
	for (let step = 0; step < drags; step++) quick.push(await timedGet(editUrl(nudged(stage.settings), 'stage=quick&device=desktop')));
	const final = await timedGet(editUrl(nudged(stage.settings), 'stage=final&device=desktop'));
	const burst = await tilesDone;
	return { stage: stage.name, load, quick, final, tilesMs: burst?.ms, tileErrors: burst?.errors };
}

function percentile(values: number[], p: number) {
	const sorted = [...values].sort((a, b) => a - b);
	return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
}

const seconds = (ms: number | undefined) => (ms === undefined ? '-' : `${(ms / 1000).toFixed(2)}s`);

const snapshots = await loadSnapshots();
if (!snapshots.length) throw new Error(`Photo ${imageId} has no saved versions to start from`);
const stages = values.replay ? replayStages(snapshots) : syntheticStages(parsePP3(snapshots[0].pp3));

console.log(`Editor load benchmark: ${base}, photo ${imageId}, ${stages.length} stages, ${drags} quick previews per drag, ${tiles} tiles per burst`);
// Warm the server (develop cache, JIT) so the first stage isn't charged for it
await timedGet(editUrl(stages[0].settings, 'stage=final&device=desktop'));

const results: Result[] = [];
for (const stage of stages) {
	for (const load of tiles ? (['idle', 'tiles'] as const) : (['idle'] as const)) {
		const result = await runStage(stage, load);
		results.push(result);
		const quickMs = result.quick.map((q) => q.ms);
		const failed = result.quick.filter((q) => q.status !== 200).length + (result.final && result.final.status !== 200 ? 1 : 0);
		console.log(
			[
				result.stage.padEnd(22),
				load.padEnd(6),
				`quick p50 ${seconds(percentile(quickMs, 50))}`,
				`p95 ${seconds(percentile(quickMs, 95))}`,
				`max ${seconds(Math.max(...quickMs))}`,
				`| final ${seconds(result.final?.ms)}`,
				load === 'tiles' ? `| ${tiles} tiles in ${seconds(result.tilesMs)}${result.tileErrors ? ` (${result.tileErrors} failed)` : ''}` : '',
				failed ? `| ${failed} preview errors` : ''
			]
				.filter(Boolean)
				.join('  ')
		);
	}
}

if (values.json) {
	await writeFile(
		values.json,
		JSON.stringify({ url: base, imageId, drags, tiles, replay: values.replay, results, stages: stages.map((s) => ({ name: s.name, pp3: stringifyPP3(s.settings) })) }, null, 2)
	);
	console.log(`Raw measurements written to ${values.json}`);
}
