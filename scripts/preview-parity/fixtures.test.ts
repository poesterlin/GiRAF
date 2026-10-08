import { test, expect } from 'bun:test';
import sharp from 'sharp';
import { fixtureTiff, compressedFixtureTiff } from './fixtures';
import { buildScenarios } from './scenarios';
test('synthetic TIFF preserves depth and clipping patches deterministically', async () => {
	for (const bits of [8, 16] as const) {
		const bytes = fixtureTiff(bits);
		expect(bytes.equals(fixtureTiff(bits))).toBe(true);
		const meta = await sharp(bytes).metadata();
		expect(meta.width).toBe(128);
		expect(meta.height).toBe(96);
		expect(meta.depth).toBe(bits === 16 ? 'ushort' : 'uchar');
		const { data } = await sharp(bytes).toColourspace('rgb16').raw({ depth: 'ushort' }).toBuffer({ resolveWithObject: true });
		const sample = (x: number, c: number) => data.readUInt16LE(((80 * 128 + x) * 3 + c) * 2);
		expect(sample(0, 0)).toBe(0);
		expect(sample(16, 0)).toBe(65535);
		expect(sample(32, 0)).toBe(65535);
		expect(sample(32, 1)).toBe(0);
	}
	expect((await sharp(fixtureTiff(16, true)).metadata()).channels).toBe(1);
});
test('compressed 16-bit fixture retains exact samples, including sub-8-bit values', async () => {
	const decode = (input: Buffer) => sharp(input).toColourspace('rgb16').raw({ depth: 'ushort' }).toBuffer();
	const original = await decode(fixtureTiff(16));
	const compressed = await decode(compressedFixtureTiff(16));
	expect(compressed.equals(original)).toBe(true);
	// The dark-red patch is 0.001 * 65535, not an 8-bit value expanded by 257.
	expect(compressed.readUInt16LE(((80 * 128 + 80) * 3) * 2)).toBe(66);
});
test('application profile is preserved and normalized scenarios are independent', () => {
	const original = { Exposure: { Auto: true, Compensation: 2 }, White_Balance: { Setting: 'Camera' } };
	const scenarios = buildScenarios(original, 128, 96, '/lut.png');
	expect(scenarios[0].pp3).toEqual(original);
	expect(scenarios.find((s) => s.name === 'baseline')!.pp3.Exposure).toEqual({ Auto: false, Compensation: 0 });
	expect(scenarios.find((s) => s.name === 'auto-exposure')!.pp3.Exposure.Auto).toBe(true);
	expect(scenarios.find((s) => s.name === 'auto-exposure-clip')!.pp3.Exposure.Clip).toBe(0.1);
	expect(scenarios.find((s) => s.name === 'lut-50')!.pp3.Film_Simulation.Strength).toBe(50);
	expect(scenarios.find((s) => s.name === 'crop')!.pp3.Crop.W).toBe(64);
	expect(original.Exposure.Auto).toBe(true);
});
