export type CurvePoint = { x: number; y: number };
export const identityPoints = (): CurvePoint[] => [{ x: 0, y: 0 }, { x: 1, y: 1 }];

/** Gentle sensitivity on the diagonal, progressively finer control away from it. */
export function curveDragSensitivity(point: CurvePoint): number {
	return 0.35 / (1 + 8 * Math.abs(point.y - point.x)) ** 2;
}

export function readToneCurve(value: unknown): CurvePoint[] | null {
	if (value === undefined || ['0', '0;'].includes(String(value).trim())) return identityPoints();
	const values = String(value).split(';').filter(Boolean).map(Number);
	if (values[0] !== 1 || values.length < 5 || values.length % 2 !== 1 || !values.every(Number.isFinite)) return null;
	const points: CurvePoint[] = [];
	for (let i = 1; i < values.length; i += 2) {
		const point = { x: values[i], y: values[i + 1] };
		if (point.x < 0 || point.x > 1 || point.y < 0 || point.y > 1 || (points.length && point.x <= points.at(-1)!.x)) return null;
		points.push(point);
	}
	return points;
}

export function writeToneCurve(points: CurvePoint[]): string {
	if (points.length === 2 && points.every((p, i) => p.x === i && p.y === i)) return '0;';
	return `1;${points.flatMap((p) => [p.x, p.y]).map((n) => Number(n.toFixed(6))).join(';')};`;
}

export function moveCurvePoint(points: CurvePoint[], index: number, x: number, y: number): CurvePoint[] {
	return points.map((point, i) => i === index ? {
		x: Math.max(index === 0 ? 0 : points[index - 1].x + 0.002, Math.min(index === points.length - 1 ? 1 : points[index + 1].x - 0.002, x)),
		y: Math.max(0, Math.min(1, y))
	} : { ...point });
}

/** Natural cubic spline, matching the PP3 type-1 curve's control points. */
export function curveSamples(points: CurvePoint[]): CurvePoint[] {
	const n = points.length;
	const second = Array(n).fill(0);
	const work = Array(n).fill(0);
	for (let i = 1; i < n - 1; i++) {
		const left = points[i].x - points[i - 1].x;
		const right = points[i + 1].x - points[i].x;
		const sig = left / (left + right);
		const p = sig * second[i - 1] + 2;
		second[i] = (sig - 1) / p;
		work[i] = (6 * ((points[i + 1].y - points[i].y) / right - (points[i].y - points[i - 1].y) / left) / (left + right) - sig * work[i - 1]) / p;
	}
	for (let i = n - 2; i >= 0; i--) second[i] = second[i] * second[i + 1] + work[i];
	return Array.from({ length: 257 }, (_, i) => {
		const x = i / 256;
		if (x <= points[0].x) return { x, y: points[0].y };
		if (x >= points[n - 1].x) return { x, y: points[n - 1].y };
		const upper = points.findIndex((p) => p.x >= x);
		const lower = upper - 1;
		const h = points[upper].x - points[lower].x;
		const a = (points[upper].x - x) / h;
		const b = (x - points[lower].x) / h;
		const y = a * points[lower].y + b * points[upper].y + ((a ** 3 - a) * second[lower] + (b ** 3 - b) * second[upper]) * h * h / 6;
		return { x, y: Math.max(0, Math.min(1, y)) };
	});
}
