import ClientPP3 from '$lib/assets/client.pp3?raw';
import { parsePP3, stringifyPP3 } from '$lib/pp3-utils';
import { existsSync } from 'node:fs';

export async function calculateImportBaseline(tiff: string, signal?: AbortSignal): Promise<string> {
	const directory = existsSync('build/client/rt-wasm.wasm') ? 'build/client' : 'static';
	const child = Bun.spawn(['bun', 'scripts/resolve-auto-exposure.ts', tiff, directory], { stdout: 'pipe', stderr: 'pipe', signal });
	const [stdout, stderr, status] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
	if (status !== 0) throw new Error(`Auto-exposure analysis failed: ${stderr}`);
	const values: unknown = JSON.parse(stdout.trim().split('\n').at(-1)!);
	if (!Array.isArray(values) || values.length !== 6 || !values.every((value) => typeof value === 'number' && Number.isFinite(value))) throw new Error('Invalid auto-exposure analysis');
	const pp3 = parsePP3(ClientPP3);
	const fields = ['Compensation', 'Brightness', 'Contrast', 'Black', 'HighlightCompr', 'HighlightComprThreshold'];
	for (const [index, field] of fields.entries()) pp3.Exposure[field] = values[index];
	pp3.Exposure.Auto = false;
	return stringifyPP3(pp3);
}
