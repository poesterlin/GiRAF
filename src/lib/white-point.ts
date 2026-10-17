// The white point is drawn as a two-point tone curve on Exposure.Curve (the tone curve tool uses
// Curve2). It has to act after the RAW stage: editor previews and exports render from developed
// TIFFs, where RawTherapee ignores RAW-only settings such as PreExposure.
// Positive values pull the white point in so highlights brighten, negative values lower the
// brightest output so whites turn grey. Each end reaches half of the range.
const REACH = 0.5;

export function whitePointToCurve(value: number): string {
	if (value === 0) return '0;';
	const shift = 1 - (Math.min(Math.abs(value), 100) / 100) * REACH;
	const end = value > 0 ? [shift, 1] : [1, shift];
	return `1;0;0;${Number(end[0].toFixed(4))};${Number(end[1].toFixed(4))};`;
}

/** Reads a curve back to a slider value; curves this slider did not write read as neutral. */
export function whitePointFromCurve(curve: unknown): number {
	const points = String(curve ?? '').split(';').filter(Boolean).map(Number);
	if (points.length !== 5 || points[0] !== 1 || points[1] !== 0 || points[2] !== 0) return 0;
	const [x, y] = points.slice(3);
	if (y === 1 && x < 1) return ((1 - x) / REACH) * 100;
	if (x === 1 && y < 1) return -((1 - y) / REACH) * 100;
	return 0;
}
