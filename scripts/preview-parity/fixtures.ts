import { join } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';

/** Minimal deterministic uncompressed little-endian TIFF, avoiding encoder depth coercion. */
export function fixtureTiff(bits: 8 | 16, grayscale = false) {
	const width = 128,
		height = 96,
		channels = grayscale ? 1 : 3;
	const tags = 10,
		dataOffset = 8 + 2 + tags * 12 + 4 + (channels === 3 ? 6 : 0);
	const bytes = (width * height * channels * bits) / 8;
	const buffer = Buffer.alloc(dataOffset + bytes);
	buffer.write('II');
	buffer.writeUInt16LE(42, 2);
	buffer.writeUInt32LE(8, 4);
	buffer.writeUInt16LE(tags, 8);
	const entries = [
		[256, 4, 1, width],
		[257, 4, 1, height],
		[258, 3, channels, channels === 3 ? dataOffset - 6 : bits],
		[259, 3, 1, 1],
		[262, 3, 1, grayscale ? 1 : 2],
		[273, 4, 1, dataOffset],
		[277, 3, 1, channels],
		[278, 4, 1, height],
		[279, 4, 1, bytes],
		[284, 3, 1, 1]
	];
	entries.forEach(([tag, type, count, value], i) => {
		const p = 10 + i * 12;
		buffer.writeUInt16LE(tag, p);
		buffer.writeUInt16LE(type, p + 2);
		buffer.writeUInt32LE(count, p + 4);
		buffer.writeUInt32LE(value, p + 8);
	});
	if (channels === 3) for (let c = 0; c < 3; c++) buffer.writeUInt16LE(bits, dataOffset - 6 + c * 2);
	const patches = [
		[0, 0, 0],
		[1, 1, 1],
		[1, 0, 0],
		[0, 1, 0],
		[0, 0, 1],
		[0.001, 0.5, 0.999],
		[0.18, 0.18, 0.18],
		[0.99, 0.01, 0.5]
	];
	for (let y = 0; y < height; y++)
		for (let x = 0; x < width; x++)
			for (let c = 0; c < channels; c++) {
				const value = y >= 64 ? patches[Math.floor(x / 16)][c] : c === 0 ? x / 127 : c === 1 ? y / 63 : (x + y) / 190;
				const p = dataOffset + (((y * width + x) * channels + c) * bits) / 8;
				if (bits === 16) buffer.writeUInt16LE(Math.round(value * 65535), p);
				else buffer[p] = Math.round(value * 255);
			}
	return buffer;
}

/** Same samples in a compressed strip, so decoder tests cannot rely on raw offsets. */
export function compressedFixtureTiff(bits: 8 | 16, grayscale = false) {
	const original = fixtureTiff(bits, grayscale);
	const header = Buffer.from(original.subarray(0, 8 + 2 + 10 * 12 + 4 + (grayscale ? 0 : 6)));
	const pixels = deflateSync(original.subarray(header.length));
	for (let i = 0; i < 10; i++) {
		const offset = 10 + i * 12;
		const tag = header.readUInt16LE(offset);
		if (tag === 259) header.writeUInt32LE(8, offset + 8); // Adobe Deflate
		if (tag === 279) header.writeUInt32LE(pixels.length, offset + 8);
	}
	return Buffer.concat([header, pixels]);
}

/** Attach a real ICC profile to these single-strip fixtures without altering samples. */
export function withIccProfile(tiff: Buffer, profile: Buffer) {
	const count = tiff.readUInt16LE(8);
	const stripEntry = Array.from({ length: count }, (_, i) => 10 + i * 12).find((offset) => tiff.readUInt16LE(offset) === 273)!;
	const headerSize = tiff.readUInt32LE(stripEntry + 8);
	const result = Buffer.alloc(tiff.length + 12 + profile.length);
	tiff.copy(result, 0, 0, 10 + count * 12);
	result.writeUInt16LE(count + 1, 8);
	for (let i = 0; i < count; i++) {
		const offset = 10 + i * 12;
		const tag = result.readUInt16LE(offset);
		if (tag === 273 || (tag === 258 && result.readUInt32LE(offset + 4) > 1)) result.writeUInt32LE(result.readUInt32LE(offset + 8) + 12, offset + 8);
	}
	const tag = 10 + count * 12;
	result.writeUInt16LE(34675, tag);
	result.writeUInt16LE(7, tag + 2);
	result.writeUInt32LE(profile.length, tag + 4);
	result.writeUInt32LE(tiff.length + 12, tag + 8);
	tiff.copy(result, headerSize + 12, headerSize);
	// Copy the sample-depth array, leaving the new directory terminator zeroed.
	tiff.copy(result, 10 + (count + 1) * 12 + 4, 10 + count * 12 + 4, headerSize);
	profile.copy(result, tiff.length + 12);
	return result;
}
export async function generateFixtures(directory: string, grayscale: boolean) {
	const files: string[] = [];
	for (const bits of [8, 16] as const) {
		const file = join(directory, `synthetic-rgb${bits}.tiff`);
		await writeFile(file, fixtureTiff(bits));
		files.push(file);
	}
	const compressed = join(directory, 'synthetic-rgb16-deflate.tiff');
	await writeFile(compressed, compressedFixtureTiff(16));
	files.push(compressed);
	if (grayscale) {
		const file = join(directory, 'synthetic-gray16.tiff');
		await writeFile(file, fixtureTiff(16, true));
		files.push(file);
	}
	return files;
}
