/**
 * Predicts which pixels a mask's colour range (RawTherapee's "scope") lets through, so the editor can show
 * the range while its slider moves, without waiting for a render.
 *
 * RawTherapee compares each pixel's colour with the colour at the mask's centre. Measured on rendered
 * photos (exposure +1 EV through a frame-covering mask, scope 5 to 80): the share of the effect a pixel
 * gets falls off smoothly with its colour distance, and both where it falls and how gradually grow with the
 * scope. The closest fit weighs lightness differences at half of the colour difference and follows a
 * logistic curve with its midpoint at 0.56·scope + 2 and width 0.22·scope; it stays within 0.3 of the
 * measured effect. Scope 100 lets every colour through.
 */

export type Lab = { l: number; a: number; b: number };

const linear = (channel: number) => {
	const c = channel / 255;
	return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const labCurve = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);

/** CIE Lab (D65) of an sRGB colour. */
export function rgbToLab(r: number, g: number, b: number): Lab {
	const red = linear(r);
	const green = linear(g);
	const blue = linear(b);
	const x = labCurve((0.4124 * red + 0.3576 * green + 0.1805 * blue) / 0.95047);
	const y = labCurve(0.2126 * red + 0.7152 * green + 0.0722 * blue);
	const z = labCurve((0.0193 * red + 0.1192 * green + 0.9505 * blue) / 1.08883);
	return { l: 116 * y - 16, a: 500 * (x - y), b: 200 * (y - z) };
}

export function colourDistance(from: Lab, to: Lab): number {
	return Math.sqrt(0.5 * (from.l - to.l) ** 2 + (from.a - to.a) ** 2 + (from.b - to.b) ** 2);
}

/** The share of the mask's effect a colour at `distance` from the reference gets, from 0 to 1. */
export function colourRangeWeight(distance: number, range: number): number {
	if (range >= 100) return 1;
	const middle = 0.56 * range + 2;
	const width = Math.max(0.5, 0.22 * range);
	return 1 / (1 + Math.exp((distance - middle) / width));
}

/** A photo converted to Lab once, so moving the slider only redoes the cheap part. */
export type LabImage = { width: number; height: number; l: Float32Array; a: Float32Array; b: Float32Array };

export function toLabImage(rgba: Uint8ClampedArray, width: number, height: number): LabImage {
	const size = width * height;
	const image: LabImage = { width, height, l: new Float32Array(size), a: new Float32Array(size), b: new Float32Array(size) };
	for (let i = 0; i < size; i++) {
		const lab = rgbToLab(rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2]);
		image.l[i] = lab.l;
		image.a[i] = lab.a;
		image.b[i] = lab.b;
	}
	return image;
}

/** The mean colour in a small disc around a point given as fractions of the photo's size. */
export function referenceColour(image: LabImage, x: number, y: number, radius = Math.max(2, Math.round(image.width / 100))): Lab {
	const cx = Math.round(x * (image.width - 1));
	const cy = Math.round(y * (image.height - 1));
	let l = 0;
	let a = 0;
	let b = 0;
	let count = 0;
	for (let py = Math.max(0, cy - radius); py <= Math.min(image.height - 1, cy + radius); py++) {
		for (let px = Math.max(0, cx - radius); px <= Math.min(image.width - 1, cx + radius); px++) {
			if ((px - cx) ** 2 + (py - cy) ** 2 > radius ** 2) continue;
			const i = py * image.width + px;
			l += image.l[i];
			a += image.a[i];
			b += image.b[i];
			count++;
		}
	}
	return count ? { l: l / count, a: a / count, b: b / count } : { l: 0, a: 0, b: 0 };
}

/** Where a mask applies: inside or outside its ellipse or rectangle, in fractions of the photo. */
export type MaskArea = { shape: 'ELI' | 'RECT'; centerX: number; centerY: number; halfWidth: number; halfHeight: number; inverted: boolean };

function insideArea(area: MaskArea, x: number, y: number): boolean {
	const dx = (x - area.centerX) / area.halfWidth;
	const dy = (y - area.centerY) / area.halfHeight;
	return area.shape === 'ELI' ? dx * dx + dy * dy <= 1 : Math.abs(dx) <= 1 && Math.abs(dy) <= 1;
}

/** Per pixel, how much of the mask's effect lands there: its area times the colour range. */
export function maskWeights(image: LabImage, area: MaskArea, reference: Lab, range: number): Float32Array {
	const weights = new Float32Array(image.width * image.height);
	for (let y = 0; y < image.height; y++) {
		for (let x = 0; x < image.width; x++) {
			const i = y * image.width + x;
			if (insideArea(area, (x + 0.5) / image.width, (y + 0.5) / image.height) === area.inverted) continue;
			const distance = colourDistance({ l: image.l[i], a: image.a[i], b: image.b[i] }, reference);
			weights[i] = colourRangeWeight(distance, range);
		}
	}
	return weights;
}
