import { parseArgs } from 'node:util';
import { mkdir, copyFile, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import sharp from 'sharp';
import { parsePP3, stringifyPP3 } from '../../src/lib/pp3-utils';
import { getRequiredClutPath } from '../../src/lib/preview-parity-policy';
import { renderNativePp3 } from '../../src/lib/wasm-pp3-api';
import { createHash } from 'node:crypto';
import { generateFixtures, withIccProfile } from './fixtures';
import { buildScenarios } from './scenarios';
import { compare } from './metrics';

const root = resolve(import.meta.dir, '../..');
const options = {
	out: { type: 'string' },
	pp3: { type: 'string' },
	lut: { type: 'string' },
	rt: { type: 'string' },
	'docker-image': { type: 'string' },
	'max-mae': { type: 'string' },
	'max-rmse': { type: 'string' },
	'min-psnr': { type: 'string' },
	'max-p99': { type: 'string' },
	mode: { type: 'string' },
	'max-mean-delta-e00': { type: 'string' },
	'max-p95-delta-e00': { type: 'string' },
	'max-fraction-above-10': { type: 'string' },
	help: { type: 'boolean' },
	synthetic: { type: 'boolean' },
	grayscale: { type: 'boolean' },
	'synthetic-icc': { type: 'string' }
} as const;
const { values: args, positionals } = parseArgs({ options, allowPositionals: true });
if (args.help) {
	console.log(
		'bun scripts/preview-parity/index.ts [--synthetic] [--grayscale] [--synthetic-icc FILE] [--out DIR] [--pp3 FILE] [--lut HALD.png] [--rt BINARY | --docker-image IMAGE] [--mode perceptual|strict] [--max-mean-delta-e00 3] [--max-p95-delta-e00 7] [--max-fraction-above-10 0.05] [--max-mae 2] [--max-rmse 3] [--min-psnr 38] [--max-p99 10] TIFF...'
	);
	process.exit(0);
}
if (!positionals.length && !args.synthetic) throw new Error('Supply at least one TIFF or --synthetic (see --help)');
if (args.rt && args['docker-image']) throw new Error('Choose --rt or --docker-image');
const limits = { mae: Number(args['max-mae'] ?? 2), rmse: Number(args['max-rmse'] ?? 3), psnr: Number(args['min-psnr'] ?? 38), p99: Number(args['max-p99'] ?? 10) };
const mode = args.mode ?? 'perceptual';
if (mode !== 'perceptual' && mode !== 'strict') throw new Error('Mode must be perceptual or strict');
const perceptualLimits = {
	meanDeltaE00: Number(args['max-mean-delta-e00'] ?? 3),
	p95: Number(args['max-p95-delta-e00'] ?? 7),
	fractionAbove10: Number(args['max-fraction-above-10'] ?? 0.05)
};
if (Object.values(perceptualLimits).some((v) => !Number.isFinite(v) || v < 0) || perceptualLimits.fractionAbove10 > 1)
	throw new Error('Perceptual thresholds must be finite nonnegative numbers; fraction must be between 0 and 1');
if (Object.values(limits).some((v) => !Number.isFinite(v) || v < 0)) throw new Error('Thresholds must be finite nonnegative numbers');
const out = resolve(args.out ?? `preview-parity-${Date.now()}`);
await mkdir(out, { recursive: true });
if (args['synthetic-icc'] && !args.synthetic) throw new Error('--synthetic-icc requires --synthetic');
if (args.synthetic) {
	const fixtures = await generateFixtures(out, !!args.grayscale);
	if (args['synthetic-icc']) {
		const profile = await readFile(resolve(args['synthetic-icc']));
		for (const fixture of fixtures.filter((path) => !path.includes('gray'))) await writeFile(fixture, withIccProfile(await readFile(fixture), profile));
	}
	positionals.push(...fixtures);
}
const hash = async (file: string) =>
	createHash('sha256')
		.update(await readFile(file))
		.digest('hex');
async function command(argv: string[], allowedCodes = [0]) {
	const child = Bun.spawn(argv, { stdout: 'pipe', stderr: 'pipe', env: { ...process.env, OMP_NUM_THREADS: '1' } });
	const [stdout, stderr, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
	if (!allowedCodes.includes(code)) throw new Error(`${argv.join(' ')} exited ${code}\n${stdout}\n${stderr}`);
	return stdout + stderr;
}
const rt = args.rt ?? 'rawtherapee-cli';
function rtCommand(tail: string[]) {
	return args['docker-image']
		? [
				'docker',
				'run',
				'--rm',
				'--network=none',
				'--user',
				`${process.getuid!()}:${process.getgid!()}`,
				'-e',
				'HOME=/tmp',
				'-e',
				'OMP_NUM_THREADS=1',
				'-v',
				`${out}:/parity`,
				'--entrypoint',
				'rawtherapee-cli',
				args['docker-image'],
				...tail
			]
		: [rt, ...tail];
}
const report: any = {
	createdAt: new Date().toISOString(),
	mode,
	limits,
	perceptualLimits,
	inputs: positionals.map((p) => resolve(p)),
	runtime: args['docker-image'] ?? rt,
	results: []
};
const escape = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
async function saveReport() {
	await writeFile(join(out, 'report.json'), JSON.stringify(report, null, 2));
	await writeFile(
		join(out, 'report.html'),
		`<!doctype html><meta charset="utf-8"><title>Preview parity</title><style>body{font-family:system-ui}img{max-width:32%;height:auto}pre{white-space:pre-wrap}</style><h1>TIFF preview parity</h1><pre>${escape(JSON.stringify({ mode, limits, perceptualLimits, error: report.error }, null, 2))}</pre>${report.results.map((r: any) => `<h2>${escape(r.name)} — ${r.pass ? 'PASS' : 'FAIL'}</h2><pre>${escape(JSON.stringify(r, null, 2))}</pre>${['wasm.jpg', 'reference.jpg', 'diff.png'].map((f) => `<a href="${r.directory}/${f}"><img alt="${f}" src="${r.directory}/${f}"></a>`).join('')}`).join('')}`
	);
}
try {
	report.version = await command(rtCommand(['--version']), [0, 2]);
	const { default: createModule } = await import(pathToFileURL(join(root, 'static/rt-wasm.js')).href);
	const wasmBinary = await readFile(join(root, 'static/rt-wasm.wasm'));
	const newModule = async () => {
		const m = await createModule({ wasmBinary, locateFile: (p: string) => join(root, 'static', p) });
		await m.ready;
		return m;
	};
	let module = await newModule();
	report.sha256 = {
		js: await hash(join(root, 'static/rt-wasm.js')),
		wasm: await hash(join(root, 'static/rt-wasm.wasm')),
		pp3: await hash(resolve(args.pp3 ?? join(root, 'src/lib/assets/client.pp3'))),
		inputs: await Promise.all(positionals.map(async (p) => ({ path: resolve(p), sha256: await hash(p) }))),
		lut: args.lut ? await hash(resolve(args.lut)) : null,
		icc: args['synthetic-icc'] ? await hash(resolve(args['synthetic-icc'])) : null
	};
	const base = parsePP3(await readFile(resolve(args.pp3 ?? join(root, 'src/lib/assets/client.pp3')), 'utf8'));
	let clut: { data: Uint16Array; level: number } | undefined;
	if (args.lut) {
		await copyFile(resolve(args.lut), join(out, 'lut.png'));
		const { loadClut } = await import('../../src/lib/server/clut');
		const loaded = await loadClut(resolve(args.lut));
		clut = { data: loaded.clutData, level: loaded.clutLevel };
	}
	report.lut = args.lut ? resolve(args.lut) : null;
	for (let index = 0; index < positionals.length; index++) {
		const input = resolve(positionals[index]);
		const metadata = await sharp(input).metadata();
		if (!['tiff', 'tif'].includes(metadata.format ?? '')) throw new Error(`Not a TIFF: ${input}`);
		for (const { name, pp3 } of buildScenarios(base, metadata.width!, metadata.height!, args.lut ? join(out, 'lut.png') : undefined)) {
			const directory = `${index}-${name}`,
				dir = join(out, directory);
			const record: any = { name: `${input}: ${name}`, directory, pass: false, errors: [] };
			report.results.push(record);
			try {
				await mkdir(dir);
				await copyFile(input, join(dir, 'input.tif'));
				const text = stringifyPP3(pp3);
				const requiredLut = getRequiredClutPath(text);
				const hasLut = !!requiredLut;
				await writeFile(join(dir, 'wasm.pp3'), text);
				if (hasLut && args['docker-image'] && args.lut) pp3.Film_Simulation.ClutFilename = '/parity/lut.png';
				await writeFile(join(dir, 'reference.pp3'), stringifyPP3(pp3));
				const allocations: number[] = [];
				const alloc = (bytes: Uint8Array) => {
					const ptr = module._malloc(bytes.length);
					if (!ptr) throw new Error('WASM allocation failed');
					allocations.push(ptr);
					module.HEAPU8.set(bytes, ptr);
					return ptr;
				};
				const tiff = await readFile(input);
				const start = performance.now();
				try {
					if (!module) module = await newModule();
					if (hasLut && !clut) throw new Error('Profile requests LUT; supply --lut matching the profile LUT');
					if (requiredLut && args.lut && resolve(requiredLut) !== resolve(args.lut) && resolve(requiredLut) !== join(out, 'lut.png')) {
						throw new Error('Profile LUT differs from --lut; supply the matching LUT');
					}
					const ptr = alloc(tiff),
						pp = alloc(new TextEncoder().encode(text + '\0'));
					const result = renderNativePp3(
						module,
						ptr,
						tiff.length,
						pp,
						85,
						hasLut && clut ? { pointer: alloc(new Uint8Array(clut.data.buffer)), count: clut.data.length, level: clut.level } : undefined
					);
					if (result !== 0) throw new Error(`WASM render failed: ${result}`);
					const size = module._get_output_size(),
						data = module._get_output_data();
					if (!size || !data) throw new Error('WASM returned empty JPEG');
					await writeFile(join(dir, 'wasm.jpg'), module.HEAPU8.slice(data, data + size));
				} catch (error) {
					record.errors.push({ renderer: 'wasm', error: String(error) });
				} finally {
					if (!record.errors.length) {
						module._free_output();
						for (const ptr of allocations) module._free(ptr);
					} else {
						module?.PThread?.terminateAllThreads();
						module = null;
					}
				}
				const wasmMs = performance.now() - start;
				const prefix = args['docker-image'] ? `/parity/${directory}` : dir;
				const rtStart = performance.now();
				let log = '';
				try {
					log = await command(rtCommand(['-o', `${prefix}/reference.jpg`, '-j85', '-js1', '-q', '-p', `${prefix}/reference.pp3`, '-Y', '-c', `${prefix}/input.tif`]));
				} catch (error) {
					log = String(error);
					record.errors.push({ renderer: 'reference', error: log });
				}
				await writeFile(join(dir, 'reference.log'), log);
				const referenceMs = performance.now() - rtStart;
				Object.assign(record, { wasmMs, referenceMs });
				if (record.errors.length) continue;
				const decode = (file: string) => sharp(join(dir, file)).toColourspace('srgb').removeAlpha().raw().toBuffer({ resolveWithObject: true });
				const [a, b] = await Promise.all([decode('wasm.jpg'), decode('reference.jpg')]);
				if (a.info.width !== b.info.width || a.info.height !== b.info.height) {
					Object.assign(record, { dimensionMismatch: true, wasm: a.info, reference: b.info });
					continue;
				}
				const { metrics, heatmap } = compare(a.data, b.data, a.info.width, a.info.height);
				await sharp(heatmap, { raw: { width: a.info.width, height: a.info.height, channels: 3 } })
					.png()
					.toFile(join(dir, 'diff.png'));
				const strictPass = metrics.mae <= limits.mae && metrics.rmse <= limits.rmse && (metrics.psnr === null || metrics.psnr >= limits.psnr) && metrics.p99 <= limits.p99;
				const perceptualPass =
					metrics.perceptual.meanDeltaE00 <= perceptualLimits.meanDeltaE00 &&
					metrics.perceptual.p95 <= perceptualLimits.p95 &&
					metrics.perceptual.fractionAbove10 <= perceptualLimits.fractionAbove10;
				const pass = mode === 'strict' ? strictPass : perceptualPass;
				Object.assign(record, { pass, strictPass, perceptualPass, width: a.info.width, height: a.info.height, metrics });
				console.log(`${directory}: ${pass ? 'PASS' : 'FAIL'} ${JSON.stringify(metrics)}`);
			} catch (error) {
				record.errors.push({ renderer: 'case', error: String(error) });
			} finally {
				await saveReport();
			}
		}
	}
} catch (error) {
	report.error = String(error);
	console.error(error);
}
await saveReport();
console.log(`Report: ${out}/report.html`);
process.exit(report.error || report.results.some((r: any) => r.errors.length) ? 2 : report.results.some((r: any) => !r.pass) ? 1 : 0);
