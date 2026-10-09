// Preserve the existing inverted PP3 range, with finer control near neutral.
const CURVATURE = 5;
const NORMALIZER = Math.expm1(CURVATURE);

export function blackLevelToPP3(value: number): number {
	if (value === 0) return 0;
	const range = value < 0 ? 32768 : 16384;
	return Math.round((-Math.sign(value) * range * Math.expm1((Math.abs(value) / 100) * CURVATURE)) / NORMALIZER);
}

export function blackLevelFromPP3(value: number): number {
	if (value === 0) return 0;
	const range = value > 0 ? 32768 : 16384;
	return ((-Math.sign(value) * Math.log1p((Math.abs(value) / range) * NORMALIZER)) / CURVATURE) * 100;
}
