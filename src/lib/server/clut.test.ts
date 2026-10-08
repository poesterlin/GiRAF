import { afterAll, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';
import sharp from 'sharp';
import { loadClut } from './clut';

const directory = await mkdtemp(join(existsSync('/tmp/opencode') ? '/tmp/opencode' : tmpdir(), 'clut-test-'));
afterAll(() => rm(directory, { recursive: true, force: true }));

function chunk(type: string, data: Buffer) {
	const body = Buffer.concat([Buffer.from(type), data]);
	let crc = 0xffffffff;
	for (const byte of body) {
		crc ^= byte;
		for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
	}
	const result = Buffer.alloc(body.length + 8);
	result.writeUInt32BE(data.length);
	body.copy(result, 4);
	result.writeUInt32BE((crc ^ 0xffffffff) >>> 0, result.length - 4);
	return result;
}

test('16-bit Hald samples retain values below 8-bit precision', async () => {
	const header = Buffer.alloc(13);
	header.writeUInt32BE(8, 0);
	header.writeUInt32BE(8, 4);
	header[8] = 16;
	header[9] = 2; // RGB
	const rows = Buffer.alloc(8 * (1 + 8 * 6));
	for (let y = 0; y < 8; y++) {
		for (let x = 0; x < 8; x++) {
			const offset = y * 49 + 1 + x * 6;
			rows.writeUInt16BE(12345, offset);
			rows.writeUInt16BE(23456, offset + 2);
			rows.writeUInt16BE(34567, offset + 4);
		}
	}
	const path = join(directory, 'precision.png');
	await Bun.write(path, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(rows)), chunk('IEND', Buffer.alloc(0))]));
	const { clutData, clutLevel } = await loadClut(path);
	expect(clutLevel).toBe(4);
	expect(clutData.length).toBe(8 * 8 * 4);
	for (let i = 0; i < clutData.length; i += 4) {
		expect([...clutData.slice(i, i + 4)]).toEqual([12345, 23456, 34567, 0]);
	}
});

test('8-bit Hald data converts to RGBX16 with correct endpoints', async () => {
	const path = join(directory, 'eight-bit.png');
	await sharp({ create: { width: 8, height: 8, channels: 3, background: { r: 255, g: 0, b: 128 } } })
		.png()
		.toFile(path);
	expect([...(await loadClut(path)).clutData.slice(0, 4)]).toEqual([65535, 0, 32896, 0]);
});

test('non-Hald images are rejected', async () => {
	const path = join(directory, 'invalid.png');
	await sharp({ create: { width: 9, height: 9, channels: 3, background: 'white' } })
		.png()
		.toFile(path);
	await expect(loadClut(path)).rejects.toThrow('Invalid HaldCLUT dimensions');
});
