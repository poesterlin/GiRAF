import ClientPP3 from '$lib/assets/client.pp3?raw';
import { parsePP3, stringifyPP3 } from '$lib/pp3-utils';
import { resolveImportExposure } from './auto-exposure-process';

export async function calculateImportBaseline(tiff: string, signal?: AbortSignal): Promise<string> {
	const values = await resolveImportExposure(tiff, signal);
	const pp3 = parsePP3(ClientPP3);
	const fields = ['Compensation', 'Brightness', 'Contrast', 'Black', 'HighlightCompr', 'HighlightComprThreshold'];
	for (const [index, field] of fields.entries()) pp3.Exposure[field] = values[index];
	pp3.Exposure.Auto = false;
	return stringifyPP3(pp3);
}
