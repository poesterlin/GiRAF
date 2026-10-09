// Inverted PP3 scale, with finer control near neutral and a stronger positive side.
const CURVATURE = 5;
const NORMALIZER = Math.expm1(CURVATURE);

export function blackLevelToPP3(value: number): number {
	if (value === 0) return 0;
	const range = 32768;
	return Math.round((-Math.sign(value) * range * Math.expm1((Math.abs(value) / 100) * CURVATURE)) / NORMALIZER);
}

export function blackLevelFromPP3(value: number): number {
	if (value === 0) return 0;
	const range = 32768;
	return ((-Math.sign(value) * Math.log1p((Math.abs(value) / range) * NORMALIZER)) / CURVATURE) * 100;
}
