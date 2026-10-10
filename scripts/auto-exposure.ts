import sharp from 'sharp';
import { stat } from 'node:fs/promises';

export type ExposureValues = [number, number, number, number, number, number];

// Bound native decoding and the RGB buffer (at most 384 MiB). The parent also
// imposes a wall-clock deadline, including JS histogram analysis.
export const MAX_ANALYSIS_PIXELS = 64 * 1024 * 1024;
const MAX_TIFF_BYTES = 1024 * 1024 * 1024;
const BINS = 8192;
const f = Math.fround;
const gamma = (x: number) => (x <= 0.00304 ? x * 12.9231 : 1.055 * Math.exp(Math.log(x) / 2.4) - 0.055);
const inverseGamma = (x: number) => (x <= 0.039286 ? x / 12.9231 : Math.exp(Math.log((x + 0.055) / 1.055) * 2.4));

// RawTherapee's inverse-sRGB LUT, including its float32 rounding and >> 3
// histogram compression. Samples are encoded RGB channels, not luminance.
const histogramBins = new Uint16Array(65536);
const gammaTable = new Float32Array(65536);
for (let i = 0; i < 65536; i++) {
	histogramBins[i] = Math.min(Math.trunc(f(f(inverseGamma(i / 65535)) * 65535)) >> 3, BINS - 1);
	gammaTable[i] = gamma(i / 65535);
}

export function buildExposureHistogram(samples: Uint8Array | Uint16Array): Uint32Array {
	const histogram = new Uint32Array(BINS);
	const scale = samples instanceof Uint8Array ? 257 : 1;
	for (const sample of samples) histogram[histogramBins[sample * scale]]++;
	return histogram;
}

/**
 * Scalar port of RawTherapee 5.12 ImProcFunctions::getAutoExp (improcfun.cc),
 * Copyright (c) 2004-2010 Gabor Horvath, GPL-3.0-or-later.
 * Preserves the histogram/octile calculation used for existing import baselines.
 * Float32 rounding and integer slider truncation follow the native algorithm.
 */
export function resolveExposureHistogram(histogram: Uint32Array, clip = 0.02): ExposureValues {
	if (histogram.length !== BINS) throw new Error('Invalid auto-exposure histogram');
	clip = Number.isFinite(clip) ? Math.max(0, Math.min(clip, 100)) : 0.02;
	const zero: ExposureValues = [0, 0, 0, 0, 0, 0];
	const scale = 65536;
	const midgray = f(0.1842);
	let sum = 0,
		average = 0;
	for (let i = 0; i < BINS; i++) {
		sum = f(sum + histogram[i]);
		average = f(average + f(i * histogram[i]));
	}
	if (!sum) return zero;
	average = f(average / sum);
	let median = 0,
		count = histogram[0];
	while (count < sum / 2 && median < BINS - 1) count += histogram[++median];
	if (!median || average < 1) return zero;
	const octile = new Float32Array(8);
	let lowSum = 0,
		highSum = 0;
	count = 0;
	for (let j = 0; j < BINS; j++) {
		if (count < 8) {
			octile[count] += histogram[j];
			if (octile[count] > sum / 8 || (count === 7 && octile[count] > sum / 16)) {
				octile[count] = Math.log(1 + j) / Math.log(2);
				count++;
			}
		}
		if (j < Math.trunc(average)) lowSum = f(lowSum + histogram[j]);
		else highSum = f(highSum + histogram[j]);
	}
	if (!lowSum || !highSum) return zero;
	let overex = 0;
	if (octile[6] > Math.log1p(BINS) / Math.log2(2)) {
		octile[6] = f(f(1.5 * octile[5]) - f(0.5 * octile[4]));
		overex = 2;
	}
	if (octile[7] > Math.log1p(BINS) / Math.log2(2)) {
		octile[7] = f(f(1.5 * octile[6]) - f(0.5 * octile[5]));
		overex = 1;
	}
	const oct6 = octile[6],
		oct7 = octile[7];
	for (let i = 1; i < 8; i++) if (!octile[i]) octile[i] = octile[i - 1];
	let spread = 0;
	for (let i = 1; i < 6; i++) {
		spread = f(spread + f(f(octile[i + 1] - octile[i]) / Math.max(0.5, i > 2 ? f(octile[i + 1] - octile[3]) : f(octile[3] - octile[i]))));
	}
	spread = f(spread / 5);
	if (spread <= 0) return zero;
	let rawmax = BINS - 1;
	while (!histogram[rawmax] && rawmax > 1) rawmax--;
	const clippable = Math.trunc((sum * clip) / 100);
	let whiteclip = BINS - 1,
		clipped = 0;
	while (whiteclip > 1 && histogram[whiteclip] + clipped <= clippable) clipped += histogram[whiteclip--];
	let shc = 0;
	clipped = 0;
	while (shc < whiteclip - 1 && histogram[shc] + clipped <= clippable) clipped += histogram[shc++];
	rawmax <<= 3;
	whiteclip <<= 3;
	average = f(average * 8);
	median <<= 3;
	shc <<= 3;
	const exp1 = f(Math.log(f(f(midgray * scale) / f(f(average - shc) + f(midgray * shc)))) / Math.log(2));
	const upper = overex === 0 ? f(f(2 * oct7) - oct6) : f(f(2 * octile[7]) - octile[6]);
	const exp2 = f(0.5 * (f(12.5 - upper) + Math.log(f(scale / rawmax)) / Math.log(2)));
	let compensation = Math.abs(exp1) - Math.abs(exp2) > 1 ? (exp1 * Math.abs(exp2) + exp2 * Math.abs(exp1)) / (Math.abs(exp1) + Math.abs(exp2)) : 0.5 * exp1 + 0.5 * exp2;
	const gain = f(Math.exp(f(compensation) * Math.log(2)));
	const correction = f(Math.sqrt(f(f(gain * scale) / rawmax)));
	let black = Math.trunc(f(shc * correction));
	const compression = f(f(f(f(gain * whiteclip) / scale) - 1) * f(2.3));
	const highlight = Math.max(0, Math.min(100, Math.trunc((100 * compression) / (Math.max(0, compensation) + 1))));
	const midtmp = f(f(gain * f(Math.sqrt(f(median * average)))) / scale);
	let brightness = Math.trunc(midtmp < f(0.1) ? f(f(f(midgray - midtmp) * 15) / midtmp) : f(f(f(midgray - midtmp) * 15) / f(f(0.10833) - f(f(0.0833) * midtmp))));
	brightness = Math.trunc(0.25 * Math.max(0, brightness));
	const contrast = Math.max(0, Math.min(100, Math.trunc(f(50 * f(f(1.1) - spread)))));
	let whiteclipGamma = Math.trunc(gamma((whiteclip * correction) / scale) * scale);
	let gammaAverage = 0,
		value = 0;
	const increment = f(correction * 8);
	for (let i = 0; i < BINS; i++) {
		const x = Math.max(0, Math.min(value, 65535));
		const index = Math.trunc(x);
		let g = gammaTable[index];
		if (index < 65535) g = f(g + f(f(x - index) * f(gammaTable[index + 1] - g)));
		gammaAverage = f(gammaAverage + f(histogram[i] * f(g * 65535)));
		value = f(value + increment);
	}
	gammaAverage = f(gammaAverage / sum);
	if (black < gammaAverage) {
		const maxwhiteclip = Math.trunc(f(f(f(f(gammaAverage - black) * 4) / 3) + black));
		whiteclipGamma = Math.max(whiteclipGamma, maxwhiteclip);
	}
	whiteclipGamma = inverseGamma(whiteclipGamma / 65535) * 65535;
	if (whiteclipGamma > 0) black = Math.trunc((65535 * black) / whiteclipGamma);
	compensation = Math.max(-5, Math.min(compensation, 12));
	const result: ExposureValues = [compensation, Math.max(-100, Math.min(brightness, 100)), contrast, black, highlight, 0];
	if (!result.every(Number.isFinite)) throw new Error('Invalid auto-exposure result');
	return result;
}

export async function analyzeTiffExposure(path: string): Promise<ExposureValues> {
	const file = await stat(path);
	if (!file.isFile() || file.size > MAX_TIFF_BYTES) throw new Error('TIFF exceeds auto-exposure file limit');
	const image = sharp(path, { limitInputPixels: MAX_ANALYSIS_PIXELS, failOn: 'error' });
	const metadata = await image.metadata();
	if (metadata.format !== 'tiff' || metadata.channels !== 3 || !['srgb', 'rgb16'].includes(metadata.space) || !['uchar', 'ushort'].includes(metadata.depth ?? '')) {
		throw new Error('Auto-exposure requires an RGB TIFF');
	}
	// libvips scales RGB8 -> RGB16 by 256, whereas the histogram's RGB8
	// convention is *257. Decode at source depth to retain that distinction.
	const is16Bit = metadata.depth === 'ushort';
	const colourspace = is16Bit ? 'rgb16' : 'srgb';
	const { data, info } = await image
		.pipelineColourspace(colourspace)
		.toColourspace(colourspace)
		.raw({ depth: is16Bit ? 'ushort' : 'uchar' })
		.timeout({ seconds: 45 })
		.toBuffer({ resolveWithObject: true });
	if (info.channels !== 3 || data.byteLength !== info.width * info.height * 3 * (is16Bit ? 2 : 1)) throw new Error('Invalid decoded TIFF');
	// Sharp raw output uses native endianness, as does this typed array.
	const samples = is16Bit ? new Uint16Array(data.buffer, data.byteOffset, data.byteLength / 2) : data;
	return resolveExposureHistogram(buildExposureHistogram(samples));
}
