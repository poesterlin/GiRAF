import { mkdir, copyFile, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

const root = resolve(import.meta.dir, '..');
const source = resolve(process.env.RT_WASM_SOURCE_DIR ?? join(root, '../rt-wasm'));
const repository = 'https://github.com/poesterlin/rt-wasm';

async function git(...args: string[]) {
	const child = Bun.spawn(['git', '-C', source, ...args], { stdout: 'pipe', stderr: 'pipe' });
	const [out, err, status] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
	if (status !== 0) throw new Error(`Cannot use rt-wasm source: ${err.trim()}`);
	return out.trim();
}

const origin = (await git('remote', 'get-url', 'origin')).replace(/\.git$/, '');
if (![repository, 'git@github.com:poesterlin/rt-wasm', 'ssh://git@github.com/poesterlin/rt-wasm'].includes(origin)) {
	throw new Error(`Expected ${repository} checkout at ${source}; found ${origin}`);
}
const commit = await git('rev-parse', 'HEAD');
const dirty = !!(await git('status', '--porcelain', '--untracked-files=no'));
if (process.env.RT_WASM_SKIP_BUILD !== '1') {
const child = Bun.spawn(['bash', 'build.sh'], {
	cwd: source,
	stdout: 'inherit',
	stderr: 'inherit',
	env: { ...process.env, RT_WASM_ENABLE_RTENGINE: process.env.RT_WASM_ENABLE_RTENGINE ?? 'OFF', RT_WASM_RTENGINE_FALLBACK: 'OFF' }
});
if ((await child.exited) !== 0) throw new Error('rt-wasm build failed; editor artifacts were not replaced');
}

const build = join(source, 'build');
const wasm = await readFile(join(build, 'rt-wasm.wasm'));
if (!WebAssembly.validate(wasm)) throw new Error('Invalid WASM binary');
const { default: createModule } = await import(pathToFileURL(join(build, 'rt-wasm.js')).href);
const module = await createModule({ wasmBinary: wasm, locateFile: (file: string) => join(build, file) });
const required = [
	'_malloc',
	'_free',
	'_tiff_to_jpeg_with_pp3',
	'_tiff_to_jpeg_with_pp3_and_clut',
	'_get_output_data',
	'_get_output_size',
	'_free_output',
	'_load_tiff_image',
	'_resolve_tiff_auto_exposure',
	'_render_tiff_image',
	'_release_tiff_image'
];
for (const name of required) {
	if (typeof module[name] !== 'function') throw new Error(`Missing editor API: ${name}`);
}

// Verify retained-image ownership and byte-identical A/B/A output before install.
const verification = Bun.spawn([process.execPath, join(source, 'test/persistent-images.mjs'), join(build, 'rt-wasm.js')], { cwd: source, stdout: 'inherit', stderr: 'inherit' });
if ((await verification.exited) !== 0) throw new Error('Native compatibility tests failed; editor artifacts were not replaced');

const files = ['rt-wasm.js', 'rt-wasm.wasm'];
for (const optional of ['rt-wasm.worker.js', 'rt-wasm.data']) {
	if (await Bun.file(join(build, optional)).exists()) files.push(optional);
}
const artifacts = await Promise.all(
	files.map(async (file) => ({
		file,
		sha256: createHash('sha256')
			.update(await readFile(join(build, file)))
			.digest('hex')
	}))
);
await mkdir(join(root, 'static'), { recursive: true });
for (const file of files) await copyFile(join(build, file), join(root, 'static', file));
await writeFile(
	join(root, 'static/rt-wasm-source.json'),
	JSON.stringify({ repository, commit, dirty, engine: process.env.RT_WASM_ENABLE_RTENGINE ?? 'OFF', artifacts }, null, 2) + '\n'
);
console.log(`Installed ${files.join(', ')} from ${repository} at ${commit}${dirty ? ' (local changes)' : ''}`);
