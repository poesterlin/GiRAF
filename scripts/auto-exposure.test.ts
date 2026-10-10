import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { analyzeTiffExposure, buildExposureHistogram, resolveExposureHistogram, type ExposureValues } from './auto-exposure';
import { resolveImportExposure } from '../src/lib/server/auto-exposure-process';

let directory: string;
beforeAll(async () => {
	directory = await mkdtemp(join(tmpdir(), 'giraf-auto-exposure-'));
});
afterAll(async () => {
	await rm(directory, { recursive: true, force: true });
});

// Small RGB16 TIFF writer makes tests independent of Sharp's input quantization.
function rgb16Tiff(samples: Uint16Array, width: number, height: number): Buffer {
	const dataOffset = 140;
	const result = Buffer.alloc(dataOffset + samples.length * 2);
	result.write('II');
	result.writeUInt16LE(42, 2);
	result.writeUInt32LE(8, 4);
	result.writeUInt16LE(10, 8);
	const tags = [
		[256, 4, 1, width],
		[257, 4, 1, height],
		[258, 3, 3, 134],
		[259, 3, 1, 1],
		[262, 3, 1, 2],
		[273, 4, 1, dataOffset],
		[277, 3, 1, 3],
		[278, 4, 1, height],
		[279, 4, 1, samples.length * 2],
		[284, 3, 1, 1]
	];
	for (const [i, [tag, type, count, value]] of tags.entries()) {
		const offset = 10 + i * 12;
		result.writeUInt16LE(tag, offset);
		result.writeUInt16LE(type, offset + 2);
		result.writeUInt32LE(count, offset + 4);
		result.writeUInt32LE(value, offset + 8);
	}
	for (let i = 0; i < 3; i++) result.writeUInt16LE(16, 134 + i * 2);
	for (let i = 0; i < samples.length; i++) result.writeUInt16LE(samples[i], dataOffset + i * 2);
	return result;
}

describe('RawTherapee auto-exposure scalar port', () => {
	// Golden values from the original scalar C++ routine compiled natively with
	// g++ -O2, using the same RGB16 channel histograms (not from this JS port).
	const cases: { sample: (i: number) => number; values: ExposureValues[] }[] = [
		{
			sample: (i: number) => i,
			values: [
				[-0.41360305994749069, 0, 22, 0, 0, 0],
				[-0.41221224516630173, 0, 22, 48, 0, 0],
				[-0.39435940235853195, 0, 22, 832, 0, 0]
			]
		},
		{
			sample: (i: number) => Math.trunc(i / 4),
			values: [
				[3.6877173185348511, 0, 21, 0, 0, 0],
				[3.6916981935501099, 0, 21, 159, 0, 0],
				[3.749868631362915, 0, 21, 2899, 0, 0]
			]
		},
		{
			sample: (i: number) => 32768 + Math.trunc(i / 2),
			values: [
				[-0.59102793782949448, 0, 32, 14034, 0, 0],
				[-0.58392348140478134, 0, 32, 14491, 0, 0],
				[-0.509813092648983, 0, 32, 19378, 0, 0]
			]
		},
		{
			sample: (i: number) => (i < 65000 ? Math.trunc(i / 3) : 65535),
			values: [
				[1.9458370804786682, 2, 22, 0, 100, 0],
				[1.9495852589607239, 2, 22, 177, 0, 0],
				[1.9861981272697449, 2, 22, 2294, 0, 0]
			]
		}
	];
	for (const [index, fixture] of cases.entries()) {
		test(`matches native reference for distribution ${index} and clipping changes`, () => {
			const histogram = buildExposureHistogram(Uint16Array.from({ length: 65536 }, (_, i) => fixture.sample(i)));
			for (const [i, clip] of [0.02, 1, 10].entries()) {
				expect(resolveExposureHistogram(histogram, clip)).toEqual(fixture.values[i]);
			}
		});
	}
	test('handles empty, black and constant images without non-finite sliders', () => {
		for (const samples of [new Uint16Array(), new Uint16Array(1024), new Uint16Array(1024).fill(65535), new Uint16Array(1024).fill(32768)]) {
			expect(resolveExposureHistogram(buildExposureHistogram(samples))).toEqual([0, 0, 0, 0, 0, 0]);
		}
	});
	test('RGB8 expansion matches encoded RGB16 and all colour channels contribute', () => {
		const bytes = Uint8Array.from({ length: 768 }, (_, i) => i % 256);
		expect(buildExposureHistogram(bytes)).toEqual(buildExposureHistogram(Uint16Array.from(bytes, (value) => value * 257)));
		expect(buildExposureHistogram(bytes).reduce((sum, value) => sum + value, 0)).toBe(bytes.length);
	});
	test('clipping defaults and bounds are deterministic', () => {
		const histogram = buildExposureHistogram(Uint16Array.from({ length: 65536 }, (_, i) => i));
		expect(resolveExposureHistogram(histogram, NaN)).toEqual(resolveExposureHistogram(histogram));
		expect(resolveExposureHistogram(histogram, -1)).toEqual(resolveExposureHistogram(histogram, 0));
		expect(resolveExposureHistogram(histogram, 101)).toEqual(resolveExposureHistogram(histogram, 100));
	});
});

describe('native TIFF analysis', () => {
	test('preserves full 16-bit samples with uncompressed and compressed TIFFs', async () => {
		const samples = Uint16Array.from({ length: 256 * 256 * 3 }, (_, i) => i % 65536);
		const input = join(directory, 'rgb16.tif');
		await writeFile(input, rgb16Tiff(samples, 256, 256));
		const expected = resolveExposureHistogram(buildExposureHistogram(samples));
		expect(await analyzeTiffExposure(input)).toEqual(expected);
		const compressed = join(directory, 'compressed.tif');
		await sharp(input).pipelineColourspace('rgb16').toColourspace('rgb16').tiff({ compression: 'lzw' }).toFile(compressed);
		expect((await sharp(compressed).metadata()).depth).toBe('ushort');
		expect(await analyzeTiffExposure(compressed)).toEqual(expected);
	});
	test('decodes RGB8 without changing its histogram', async () => {
		const samples = Uint8Array.from({ length: 256 * 16 * 3 }, (_, i) => i % 256);
		const path = join(directory, 'rgb8.tif');
		await sharp(samples, { raw: { width: 256, height: 16, channels: 3 } })
			.tiff({ compression: 'lzw' })
			.toFile(path);
		expect(await analyzeTiffExposure(path)).toEqual(resolveExposureHistogram(buildExposureHistogram(samples)));
	});
	test('rejects invalid input and oversized dimensions', async () => {
		const invalid = join(directory, 'invalid.tif');
		await writeFile(invalid, 'invalid TIFF');
		await expect(analyzeTiffExposure(invalid)).rejects.toThrow();
		const oversized = join(directory, 'oversized.tif');
		await writeFile(oversized, rgb16Tiff(new Uint16Array(3), 100000, 100000));
		await expect(analyzeTiffExposure(oversized)).rejects.toThrow('pixel limit');
	});
	test('standalone resolver emits six sliders and reports failures', async () => {
		const good = Bun.spawn([process.execPath, 'scripts/resolve-auto-exposure.ts', join(directory, 'rgb16.tif')], { stdout: 'pipe', stderr: 'pipe' });
		const output = await new Response(good.stdout).text();
		expect(await good.exited).toBe(0);
		expect(JSON.parse(output)).toHaveLength(6);
		const bad = Bun.spawn([process.execPath, 'scripts/resolve-auto-exposure.ts', join(directory, 'missing.tif')], { stdout: 'pipe', stderr: 'pipe' });
		expect(await bad.exited).toBe(1);
		expect(await new Response(bad.stdout).text()).toBe('');
	});
	test('parent resolver returns values and propagates native decode errors', async () => {
		expect(await resolveImportExposure(join(directory, 'rgb16.tif'))).toEqual(await analyzeTiffExposure(join(directory, 'rgb16.tif')));
		await expect(resolveImportExposure(join(directory, 'missing.tif'))).rejects.toThrow('Auto-exposure analysis failed');
	});
	test('cancellation rejects before launch and while the child is running', async () => {
		const reason = new Error('Import cancelled');
		const controller = new AbortController();
		controller.abort(reason);
		await expect(resolveImportExposure(join(directory, 'rgb16.tif'), controller.signal)).rejects.toBe(reason);
		const running = new AbortController();
		const result = resolveImportExposure(join(directory, 'rgb16.tif'), running.signal);
		running.abort(reason);
		await expect(result).rejects.toBe(reason);
	});
	test('wall-clock deadline terminates analysis', async () => {
		await expect(resolveImportExposure(join(directory, 'rgb16.tif'), undefined, 0)).rejects.toThrow('deadline');
	});
});
