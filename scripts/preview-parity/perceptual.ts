/** CIELAB under D65, with the standard sRGB transfer function and D65 matrix. */
export type Lab = readonly [number, number, number];
const linear = Array.from({ length: 256 }, (_, i) => {
	const v = i / 255;
	return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
});
export function rgbToLab(r: number, g: number, b: number): Lab {
	const R = linear[r],
		G = linear[g],
		B = linear[b];
	const f = (v: number) => (v > (6 / 29) ** 3 ? Math.cbrt(v) : v / (3 * (6 / 29) ** 2) + 4 / 29);
	const x = f((0.4124564 * R + 0.3575761 * G + 0.1804375 * B) / 0.95047);
	const y = f(0.2126729 * R + 0.7151522 * G + 0.072175 * B);
	const z = f((0.0193339 * R + 0.119192 * G + 0.9503041 * B) / 1.08883);
	return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

/** CIEDE2000 (Sharma et al.), kL = kC = kH = 1. Angles are in degrees. */
export function deltaE00([l1, a1, b1]: Lab, [l2, a2, b2]: Lab): number {
	const radians = Math.PI / 180;
	const sin = (v: number) => Math.sin(v * radians);
	const cos = (v: number) => Math.cos(v * radians);
	const c1 = Math.hypot(a1, b1),
		c2 = Math.hypot(a2, b2);
	const c = (c1 + c2) / 2;
	const g = 0.5 * (1 - Math.sqrt(c ** 7 / (c ** 7 + 25 ** 7)));
	const ap1 = (1 + g) * a1,
		ap2 = (1 + g) * a2;
	const cp1 = Math.hypot(ap1, b1),
		cp2 = Math.hypot(ap2, b2);
	const hue = (a: number, b: number) => (Math.atan2(b, a) / radians + 360) % 360;
	const h1 = cp1 === 0 ? 0 : hue(ap1, b1),
		h2 = cp2 === 0 ? 0 : hue(ap2, b2);
	const dl = l2 - l1,
		dc = cp2 - cp1;
	let dh = h2 - h1;
	if (cp1 * cp2 === 0) dh = 0;
	else if (dh > 180) dh -= 360;
	else if (dh < -180) dh += 360;
	const dH = 2 * Math.sqrt(cp1 * cp2) * sin(dh / 2);
	const lm = (l1 + l2) / 2,
		cm = (cp1 + cp2) / 2;
	const hm = cp1 * cp2 === 0 ? h1 + h2 : Math.abs(h1 - h2) <= 180 ? (h1 + h2) / 2 : (h1 + h2 + (h1 + h2 < 360 ? 360 : -360)) / 2;
	const t = 1 - 0.17 * cos(hm - 30) + 0.24 * cos(2 * hm) + 0.32 * cos(3 * hm + 6) - 0.2 * cos(4 * hm - 63);
	const sl = 1 + (0.015 * (lm - 50) ** 2) / Math.sqrt(20 + (lm - 50) ** 2);
	const sc = 1 + 0.045 * cm,
		sh = 1 + 0.015 * cm * t;
	const rt = -2 * Math.sqrt(cm ** 7 / (cm ** 7 + 25 ** 7)) * sin(60 * Math.exp(-(((hm - 275) / 25) ** 2)));
	const L = dl / sl,
		C = dc / sc,
		H = dH / sh;
	return Math.sqrt(L * L + C * C + H * H + rt * C * H);
}
