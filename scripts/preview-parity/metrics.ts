import { deltaE00, rgbToLab } from './perceptual';

export function compare(a: Uint8Array, b: Uint8Array, width: number, height: number) {
	if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) throw new Error('Invalid RGB dimensions');
	if (a.length !== b.length || a.length !== width * height * 3) throw new Error('RGB dimensions differ');
	let sum = 0,
		squares = 0;
	const histogram = new Uint32Array(256);
	const heatmap = Buffer.alloc(a.length);
	const differences = new Float64Array(width * height);
	let deltaSum = 0,
		above2 = 0,
		above5 = 0,
		above10 = 0;
	for (let i = 0; i < a.length; i += 3) {
		let pixel = 0;
		for (let c = 0; c < 3; c++) {
			const d = Math.abs(a[i + c] - b[i + c]);
			sum += d;
			squares += d * d;
			pixel = Math.max(pixel, d);
		}
		histogram[pixel]++;
		const delta = deltaE00(rgbToLab(a[i], a[i + 1], a[i + 2]), rgbToLab(b[i], b[i + 1], b[i + 2]));
		differences[i / 3] = delta;
		deltaSum += delta;
		if (delta > 2) above2++;
		if (delta > 5) above5++;
		if (delta > 10) above10++;
		heatmap[i] = Math.min(255, pixel * 8);
		heatmap[i + 1] = Math.min(255, pixel * 2);
	}
	const percentile = (p: number) => {
		let count = 0;
		for (let d = 0; d < 256; d++) {
			count += histogram[d];
			if (count >= Math.ceil(width * height * p)) return d;
		}
		return 255;
	};
	const rmse = Math.sqrt(squares / a.length);
	differences.sort();
	const deltaPercentile = (p: number) => differences[Math.ceil(differences.length * p) - 1];
	return {
		metrics: {
			mae: sum / a.length,
			rmse,
			psnr: rmse === 0 ? null : 20 * Math.log10(255 / rmse),
			p50: percentile(0.5),
			p95: percentile(0.95),
			p99: percentile(0.99),
			max: percentile(1),
			perceptual: {
				meanDeltaE00: deltaSum / differences.length,
				p50: deltaPercentile(0.5),
				p95: deltaPercentile(0.95),
				p99: deltaPercentile(0.99),
				max: deltaPercentile(1),
				fractionAbove2: above2 / differences.length,
				fractionAbove5: above5 / differences.length,
				fractionAbove10: above10 / differences.length
			}
		},
		heatmap
	};
}
