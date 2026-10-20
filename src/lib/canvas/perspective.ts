import { safeNumber, type Dimensions } from './crop';

/**
 * On-device preview of RawTherapee's simple perspective correction.
 *
 * RawTherapee's transform works backwards: for every pixel of the output frame it walks into the
 * source image. `rtengine/iptransform.cc` (`transCoord`) applies, in this order, the perspective
 * correction, then the fine rotation, all around the image centre:
 *
 *   x = scale * (x - w/2),  y = scale * (y - h/2)
 *   horizontal: y *= R / (R + x * tanH);  x *= R * cosH / (R + x * tanH)
 *   vertical:   x *= R / (R - y * tanV);  y *= R * cosV / (R - y * tanV)
 *   rotate:     x' = x * cos(deg) - y * sin(deg);  y' = x * sin(deg) + y * cos(deg)
 *
 * where R is half the image diagonal. The server draws the preview without any geometry and the crop
 * canvas applies it here, so the sliders move at frame rate. AutoFill is the scale at which every
 * output corner still samples inside the source, exactly what RawTherapee searches for.
 */
export type PerspectiveParams = {
	vertical: number;
	horizontal: number;
	degree: number;
};

export type PerspectiveGeometry = {
	width: number;
	height: number;
	/** Half the image diagonal in source pixels. */
	radius: number;
	/** Fine rotation in radians. */
	rotation: number;
	vTan: number;
	vCos: number;
	hTan: number;
	hCos: number;
	/** Scale at which the output frame no longer samples outside the source. */
	autoFill: number;
};

/** RawTherapee maps the -100..100 sliders to -45..45 degrees. */
export function getPerspectiveGeometry(width: number, height: number, params: PerspectiveParams): PerspectiveGeometry {
	const w = Math.max(1, width);
	const h = Math.max(1, height);
	const radius = Math.hypot(w, h) / 2;
	const vertical = clampSlider(params.vertical);
	const horizontal = clampSlider(params.horizontal);
	const vAngle = perspectiveAngle(vertical, w, radius);
	const hAngle = perspectiveAngle(horizontal, h, radius);
	const partial = {
		width: w,
		height: h,
		radius,
		rotation: (safeNumber(params.degree) * Math.PI) / 180,
		vTan: Math.tan(vAngle),
		vCos: Math.cos(vAngle) * (vertical >= 0 ? 1 : -1),
		hTan: Math.tan(hAngle),
		hCos: Math.cos(hAngle) * (horizontal >= 0 ? 1 : -1),
		vertical,
		horizontal
	};
	return { ...partial, autoFill: getPerspectiveAutoFillScale(w, h, partial) };
}

/** The tilt RawTherapee derives from a slider value, or 0 when the slider is neutral. */
function perspectiveAngle(value: number, size: number, radius: number): number {
	const degree = (value / 100) * 45;
	const alpha = ((90 - degree) / 180) * Math.PI;
	// tan(90°) is infinite; this epsilon mirrors RawTherapee's own guard.
	if (Math.abs(alpha - Math.PI / 2) < 3e-4) return 0;
	const tan = Math.tan(alpha);
	const sign = degree >= 0 ? 1 : -1;
	const inner = (-size * size * tan * tan + sign * size * tan * Math.sqrt(16 * radius * radius + size * size * tan * tan)) / (radius * radius * 8);
	return Math.acos(clamp(sign * Math.sqrt(Math.max(0, inner)), -1, 1));
}

type PerspectiveFactors = Pick<PerspectiveGeometry, 'width' | 'height' | 'radius' | 'rotation' | 'vTan' | 'vCos' | 'hTan' | 'hCos'> & {
	vertical: number;
	horizontal: number;
};

/** RawTherapee's AutoFill: the largest scale whose output border still samples inside the source. */
function getPerspectiveAutoFillScale(width: number, height: number, geometry: PerspectiveFactors): number {
	if (!geometry.vertical && !geometry.horizontal && !geometry.rotation) return 1;
	let upper = 2;
	let lower = 0.001;
	const corners: [number, number][] = [];
	const x2 = width - 1;
	const y2 = height - 1;
	corners.push([0, 0], [0, y2], [x2, y2], [x2, 0]);
	const xStep = Math.max(1, Math.floor(x2 / 32));
	for (let x = xStep; x <= x2 - xStep; x += xStep) corners.push([x, 0], [x, y2]);
	const yStep = Math.max(1, Math.floor(y2 / 32));
	for (let y = yStep; y <= y2 - yStep; y += yStep) corners.push([0, y], [x2, y]);

	const probe = { ...geometry, autoFill: 1 } as PerspectiveGeometry;

	do {
		const scale = (upper + lower) / 2;
		let clipped = false;
		for (const [x, y] of corners) {
			const point = inversePoint(probe, x, y, scale);
			if (point.x < 0 || point.x > width - 1 || point.y < 0 || point.y > height - 1) {
				clipped = true;
				break;
			}
		}
		if (clipped) upper = scale;
		else lower = scale;
	} while (upper - lower > 0.001);

	return lower;
}

/** Output pixel -> source pixel, for a given autofill scale. RawTherapee's `transCoord`. */
export function inversePoint(geometry: PerspectiveGeometry, x: number, y: number, scale = geometry.autoFill): { x: number; y: number } {
	const w2 = geometry.width / 2 - 0.5;
	const h2 = geometry.height / 2 - 0.5;
	const radius = geometry.radius;
	let xd = scale * (x - w2);
	let yd = scale * (y - h2);

	const hDenominator = radius + xd * geometry.hTan;
	yd *= radius / hDenominator;
	xd *= (radius * geometry.hCos) / hDenominator;

	const vDenominator = radius - yd * geometry.vTan;
	xd *= radius / vDenominator;
	yd *= (radius * geometry.vCos) / vDenominator;

	const cos = Math.cos(geometry.rotation);
	const sin = Math.sin(geometry.rotation);
	return { x: xd * cos - yd * sin + w2, y: xd * sin + yd * cos + h2 };
}

/** Source pixel -> output pixel, the direction the canvas draws. */
export function forwardPoint(geometry: PerspectiveGeometry, x: number, y: number, scale = geometry.autoFill): { x: number; y: number } {
	const w2 = geometry.width / 2 - 0.5;
	const h2 = geometry.height / 2 - 0.5;
	const radius = geometry.radius;
	const cos = Math.cos(geometry.rotation);
	const sin = Math.sin(geometry.rotation);
	const x0 = x - w2;
	const y0 = y - h2;

	// Rotation first, then the inverse of RawTherapee's perspective steps.
	const xr = x0 * cos + y0 * sin;
	const yr = -x0 * sin + y0 * cos;

	const vDenominator = radius * geometry.vCos + yr * geometry.vTan;
	const y1 = (yr * radius) / vDenominator;
	const x1 = (xr * (radius - y1 * geometry.vTan)) / radius;

	const hDenominator = radius * geometry.hCos - x1 * geometry.hTan;
	const xd = (x1 * radius) / hDenominator;
	const yd = (y1 * (radius + xd * geometry.hTan)) / radius;

	return { x: xd / scale + w2, y: yd / scale + h2 };
}

/**
 * Draws the source image transformed by the geometry into the frame at `padding`. The transform is done
 * in three passes: rotation, then the vertical and horizontal perspective warps as strips. Each warp is
 * a 1D scale along the strip, so one strip per output row or column reproduces it exactly. The passes run
 * at the source resolution, so the photo is only resampled once, when the finished frame is scaled to fit.
 */
export function drawPerspectivePreview(
	ctx: CanvasRenderingContext2D,
	image: CanvasImageSource,
	params: PerspectiveParams,
	{ padding, displayScale }: { padding: number; displayScale: number },
	imageDimensions: Dimensions
): { width: number; height: number; autoFill: number } {
	// Full-resolution previews would make the passes needlessly large: keep them near the display size
	// (with headroom for the final downscale) so a big TIFF cannot allocate or redraw more than is useful.
	const sourceEdge = Math.max(1, imageDimensions.width, imageDimensions.height);
	const displayEdge = sourceEdge * displayScale;
	const renderScale = Math.min(1, Math.max(640, Math.min(MAX_PASS_EDGE, displayEdge * 1.75)) / sourceEdge);
	const frameWidth = Math.max(1, Math.round(imageDimensions.width * renderScale));
	const frameHeight = Math.max(1, Math.round(imageDimensions.height * renderScale));
	const geometry = getPerspectiveGeometry(frameWidth, frameHeight, params);
	const frame: PerspectiveGeometry = { ...geometry, autoFill: 1 };

	const rotationPass = getScratchCanvas(0, frameWidth, frameHeight);
	const verticalPass = getScratchCanvas(1, frameWidth, frameHeight);
	const horizontalPass = getScratchCanvas(2, frameWidth, frameHeight);

	// Pass 1: fine rotation around the centre of the frame.
	const rotated = rotationPass.getContext('2d')!;
	rotated.imageSmoothingQuality = 'high';
	rotated.setTransform(1, 0, 0, 1, 0, 0);
	rotated.clearRect(0, 0, frameWidth, frameHeight);
	rotated.translate(frameWidth / 2, frameHeight / 2);
	rotated.rotate(-frame.rotation);
	rotated.translate(-frameWidth / 2, -frameHeight / 2);
	rotated.drawImage(image, 0, 0, frameWidth, frameHeight);

	// Pass 2: vertical perspective as one scaled strip per output row.
	let warped: HTMLCanvasElement = rotationPass;
	if (frame.vTan) {
		const vertical = verticalPass.getContext('2d')!;
		vertical.imageSmoothingQuality = 'high';
		vertical.setTransform(1, 0, 0, 1, 0, 0);
		vertical.clearRect(0, 0, frameWidth, frameHeight);
		const halfHeight = frameHeight / 2;
		for (let y = 0; y < frameHeight; y++) {
			const output = y + 0.5 - halfHeight;
			const denominator = frame.radius - output * frame.vTan;
			if (Math.abs(denominator) < 1e-6) continue;
			const source = (output * frame.radius * frame.vCos) / denominator;
			const scaleX = denominator / frame.radius;
			if (!Number.isFinite(scaleX) || Math.abs(scaleX) < 1e-6) continue;
			const sourceY = source + halfHeight - 0.5;
			vertical.drawImage(rotationPass, 0, sourceY, frameWidth, 1, (frameWidth / 2) * (1 - scaleX), y, frameWidth * scaleX, 1);
		}
		warped = verticalPass;
	}

	// Pass 3: horizontal perspective as one scaled strip per output column.
	if (frame.hTan) {
		const horizontal = horizontalPass.getContext('2d')!;
		horizontal.imageSmoothingQuality = 'high';
		horizontal.setTransform(1, 0, 0, 1, 0, 0);
		horizontal.clearRect(0, 0, frameWidth, frameHeight);
		const halfWidth = frameWidth / 2;
		for (let x = 0; x < frameWidth; x++) {
			const output = x + 0.5 - halfWidth;
			const denominator = frame.radius + output * frame.hTan;
			if (Math.abs(denominator) < 1e-6) continue;
			const source = (output * frame.radius * frame.hCos) / denominator;
			const scaleY = denominator / frame.radius;
			if (!Number.isFinite(scaleY) || Math.abs(scaleY) < 1e-6) continue;
			const sourceX = source + halfWidth - 0.5;
			horizontal.drawImage(warped, sourceX, 0, 1, frameHeight, x, (frameHeight / 2) * (1 - scaleY), 1, frameHeight * scaleY);
		}
		warped = horizontalPass;
	}

	// AutoFill zooms the corrected frame back out, then it is scaled to the display.
	const displayWidth = Math.round(imageDimensions.width * displayScale);
	const displayHeight = Math.round(imageDimensions.height * displayScale);
	const zoom = displayScale / renderScale / geometry.autoFill;
	ctx.save();
	ctx.imageSmoothingQuality = 'high';
	ctx.translate(padding + displayWidth / 2, padding + displayHeight / 2);
	ctx.scale(zoom, zoom);
	ctx.drawImage(warped, -frameWidth / 2, -frameHeight / 2);
	ctx.restore();

	return { width: displayWidth, height: displayHeight, autoFill: geometry.autoFill };
}

const MAX_PASS_EDGE = 3200;

const scratch: (HTMLCanvasElement | null)[] = [null, null, null];

function getScratchCanvas(index: number, width: number, height: number): HTMLCanvasElement {
	let canvas = scratch[index];
	if (!canvas) {
		canvas = document.createElement('canvas');
		scratch[index] = canvas;
	}
	if (canvas.width !== width || canvas.height !== height) {
		canvas.width = width;
		canvas.height = height;
	}
	return canvas;
}

function clampSlider(value: number): number {
	return Math.max(-100, Math.min(100, safeNumber(value)));
}

function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value));
}
