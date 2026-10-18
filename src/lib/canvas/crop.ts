import type { PP3 } from '$lib/pp3-utils';

export type CropResize = { Enabled?: boolean; LongEdge?: number; Width?: number; Height?: number };
export type Dimensions = { width: number; height: number };
export type CropRect = { X: number; Y: number; W: number; H: number };

export function safeNumber(value: unknown): number {
	const n = Number(value);
	return Number.isFinite(n) ? n : 0;
}

/**
 * Compute the AutoFill zoom scale for a W×H image rotated by angleDeg.
 * This is the minimum uniform zoom needed to fill the original dimensions
 * with no black corners, matching RawTherapee's AutoFill=true behavior.
 */
export function getAutoFillScale(imgW: number, imgH: number, angleDeg: number): number {
	if (!angleDeg || !Number.isFinite(angleDeg)) return 1;
	const rad = (Math.abs(angleDeg) * Math.PI) / 180;
	const cosA = Math.cos(rad);
	const sinA = Math.sin(rad);
	return Math.max(cosA + (imgH / imgW) * sinA, cosA + (imgW / imgH) * sinA);
}

export function getDisplayScale(imgW: number, imgH: number, maxW: number, maxH: number): number {
	if (imgW <= 0 || imgH <= 0) {
		return 0;
	}
	return Math.min(1, maxW / imgW, maxH / imgH);
}

export function getDisplayDimensions(imgW: number, imgH: number, scale: number): { width: number; height: number } {
	return {
		width: Math.round(imgW * scale),
		height: Math.round(imgH * scale)
	};
}

export function screenToCropSpace(screenX: number, screenY: number, padding: number, displayScale: number): { x: number; y: number } {
	return {
		x: (screenX - padding) / displayScale,
		y: (screenY - padding) / displayScale
	};
}

export function scaleCropPP3(pp3: PP3, displayScale: number): PP3<number> | null {
	if (!pp3?.Crop) {
		return null;
	}

	const crop = pp3.Crop;
	return {
		...pp3,
		Crop: {
			...crop,
			X: safeNumber(crop.X) * displayScale,
			Y: safeNumber(crop.Y) * displayScale,
			W: safeNumber(crop.W) * displayScale,
			H: safeNumber(crop.H) * displayScale
		}
	} as PP3<number>;
}

export function getPreviewDimensions(width: number, height: number, resize?: CropResize): { width: number; height: number } {
	if (!resize?.Enabled) {
		return { width, height };
	}

	const longEdge = Number.isFinite(resize.LongEdge) ? Number(resize.LongEdge) : 0;
	if (longEdge > 0) {
		const scale = longEdge / Math.max(width, height);
		return { width: Math.round(width * scale), height: Math.round(height * scale) };
	}

	const previewWidth = Number.isFinite(resize.Width) ? Number(resize.Width) : width;
	const previewHeight = Number.isFinite(resize.Height) ? Number(resize.Height) : height;
	return { width: Math.round(previewWidth), height: Math.round(previewHeight) };
}

/** Flip a crop with negative width or height so that W and H are positive, moving X or Y to match. */
export function normalizeCropSize(crop: Record<string, number>): void {
	if (crop.W < 0) {
		crop.X += crop.W;
		crop.W = -crop.W;
	}
	if (crop.H < 0) {
		crop.Y += crop.H;
		crop.H = -crop.H;
	}
}

export function sanitizeCrop(crop: CropRect, imageDimensions: Dimensions, innerRect: Dimensions): void {
	crop.X = safeNumber(crop.X);
	crop.Y = safeNumber(crop.Y);
	crop.W = safeNumber(crop.W);
	crop.H = safeNumber(crop.H);

	normalizeCropSize(crop);

	crop.W = Math.max(20, crop.W);
	crop.H = Math.max(20, crop.H);

	// Ensure integer crop values for RawTherapee.
	crop.X = Math.round(crop.X);
	crop.Y = Math.round(crop.Y);
	crop.W = Math.round(crop.W);
	crop.H = Math.round(crop.H);
}

export function createInitialCrop(
	imageX: number,
	imageY: number,
	imageDimensions: Dimensions
): {
	Enabled: true;
	X: number;
	Y: number;
	W: number;
	H: number;
	FixedRatio: false;
	Ratio: '1:1';
} {
	return {
		Enabled: true,
		X: Math.max(0, Math.min(imageX, imageDimensions.width - 1)),
		Y: Math.max(0, Math.min(imageY, imageDimensions.height - 1)),
		W: 24,
		H: 24,
		FixedRatio: false,
		Ratio: '1:1'
	};
}
