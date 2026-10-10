export type Levels = { black: number; white: number; gamma: number };
export const defaultLevels: Levels = { black: 0, white: 255, gamma: 1 };

export function normalizeLevels(levels: Levels): Levels {
	const black = Math.max(0, Math.min(253, levels.black));
	return {
		black,
		white: Math.max(black + 2, Math.min(255, levels.white)),
		gamma: Math.max(0.2, Math.min(5, levels.gamma))
	};
}

/** RT spline curve: type 1 followed by normalized input/output pairs. */
export function levelsToCurve(input: Levels): string {
	const { black, white, gamma } = normalizeLevels(input);
	if (black === 0 && white === 255 && gamma === 1) return '0;';
	const points = Array.from({ length: 33 }, (_, i) => {
		const t = i / 32;
		return [(black + (white - black) * t) / 255, t ** (1 / gamma)];
	});
	return `1;${points.flat().map((n) => Number(n.toFixed(8))).join(';')};`;
}

/** Recognize only our sampled levels curves; leave arbitrary imported curves intact. */
export function levelsFromCurve(curve: unknown): Levels | null {
	if (curve === undefined || ['0', '0;'].includes(String(curve).trim())) return { ...defaultLevels };
	const values = String(curve).split(';').filter(Boolean).map(Number);
	if (values.length !== 67 || values[0] !== 1 || !values.every(Number.isFinite)) return null;
	const black = Math.round(values[1] * 255);
	const white = Math.round(values[65] * 255);
	const gamma = Math.log(0.5) / Math.log(values[34]);
	if (black < 0 || white > 255 || white - black < 2 || !Number.isFinite(gamma) || gamma < 0.1999 || gamma > 5.0001) return null;
	const levels = { black, white, gamma: Number(gamma.toFixed(4)) };
	const expected = levelsToCurve(levels).split(';').filter(Boolean).map(Number);
	if (expected.length !== values.length || values.some((value, i) => Math.abs(value - expected[i]) > 0.0001)) return null;
	return levels;
}

export function midpoint(levels: Levels): number {
	return levels.black + (levels.white - levels.black) * 0.5 ** levels.gamma;
}

export function moveLevel(levels: Levels, handle: 'black' | 'gamma' | 'white', position: number): Levels {
	if (handle === 'black') return normalizeLevels({ ...levels, black: Math.round(Math.min(position, levels.white - 2)) });
	if (handle === 'white') return normalizeLevels({ ...levels, white: Math.round(Math.max(position, levels.black + 2)) });
	const fraction = Math.max(0.001, Math.min(0.999, (position - levels.black) / (levels.white - levels.black)));
	return normalizeLevels({ ...levels, gamma: Math.log(fraction) / Math.log(0.5) });
}
