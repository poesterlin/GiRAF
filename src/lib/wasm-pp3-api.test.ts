import { expect, test } from 'bun:test';
import { renderNativePp3 } from './wasm-pp3-api';

test('LUT ABI never interprets JPEG quality as a heap pointer', () => {
	let received: number[] = [];
	const module = {
		_tiff_to_jpeg_with_pp3: () => {
			throw new Error('Wrong entry point');
		},
		_tiff_to_jpeg_with_pp3_and_clut: (...args: number[]) => {
			received = args;
			return 0;
		}
	};
	expect(renderNativePp3(module, 1024, 2048, 4096, 85, { pointer: 8192, count: 256, level: 4 })).toBe(0);
	expect(received).toEqual([1024, 2048, 4096, 8192, 256, 4, 85]);
});

test('plain PP3 rendering retains the four-argument ABI and errors', () => {
	const module = {
		_tiff_to_jpeg_with_pp3: (...args: number[]) => {
			expect(args).toEqual([1024, 2048, 4096, 85]);
			return -3;
		},
		_tiff_to_jpeg_with_pp3_and_clut: () => {
			throw new Error('Wrong entry point');
		}
	};
	expect(renderNativePp3(module, 1024, 2048, 4096, 85)).toBe(-3);
});
