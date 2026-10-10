import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const directory = resolve(process.argv[3] ?? 'static');
const { default: factory } = await import(pathToFileURL(resolve(directory, 'rt-wasm.js')).href);
const module = await factory({ wasmBinary: await readFile(resolve(directory, 'rt-wasm.wasm')), locateFile: (name: string) => resolve(directory, name) });
const bytes = await readFile(process.argv[2]);
const input = module._malloc(bytes.length);
const output = module._malloc(48);
let handle = 0;
try {
	if (!input || !output) throw new Error('Unable to allocate auto-exposure buffers');
	module.HEAPU8.set(bytes, input);
	handle = module._load_tiff_image(input, bytes.length);
	if (!handle || module._resolve_tiff_auto_exposure(handle, 0.02, output) !== 0) throw new Error(module.UTF8ToString(module._get_error_message()));
	const values = Array.from(new Float64Array(module.HEAPU8.buffer, output, 6));
	if (!values.every(Number.isFinite)) throw new Error('Invalid auto-exposure result');
	console.log(JSON.stringify(values));
} finally {
	if (handle) module._release_tiff_image(handle);
	module._free(input);
	module._free(output);
}
process.exit(0);
