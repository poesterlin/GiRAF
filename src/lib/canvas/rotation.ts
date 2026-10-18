/**
 * Rotation geometry utilities for canvas-based rotation preview.
 *
 * Coordinate spaces:
 *   Image space  – original pixel coords (0,0) → (imgW, imgH)
 *   Rotated space – after rotating around image center; crop coords live in the
 *                   AABB of the rotated quad
 *   Screen space  – canvas pixels after scaling to fit display
 */

/** Build a DOMMatrix that rotates around a pivot point. */
export function imgToRotMatrix(angleDeg: number, pivot: { x: number; y: number }): DOMMatrix {
	const m = new DOMMatrix();
	m.translateSelf(pivot.x, pivot.y);
	m.rotateSelf(angleDeg); // DOMMatrix.rotateSelf takes degrees
	m.translateSelf(-pivot.x, -pivot.y);
	return m;
}

/** Transform a point through a DOMMatrix. */
export function applyToPoint(m: DOMMatrix, p: { x: number; y: number }): { x: number; y: number } {
	const pt = new DOMPoint(p.x, p.y).matrixTransform(m);
	return { x: pt.x, y: pt.y };
}

/**
 * Compute the axis-aligned bounding box of the image after rotation.
 * Returns the AABB origin (minX, minY) and dimensions (width, height).
 */
export function getRotatedAABB(imgW: number, imgH: number, angleDeg: number): { minX: number; minY: number; width: number; height: number } {
	const pivot = { x: imgW / 2, y: imgH / 2 };
	const m = imgToRotMatrix(angleDeg, pivot);

	const corners = [
		{ x: 0, y: 0 },
		{ x: imgW, y: 0 },
		{ x: imgW, y: imgH },
		{ x: 0, y: imgH }
	];

	const transformed = corners.map((c) => applyToPoint(m, c));

	let minX = Infinity,
		minY = Infinity,
		maxX = -Infinity,
		maxY = -Infinity;
	for (const p of transformed) {
		if (p.x < minX) minX = p.x;
		if (p.y < minY) minY = p.y;
		if (p.x > maxX) maxX = p.x;
		if (p.y > maxY) maxY = p.y;
	}

	return { minX, minY, width: maxX - minX, height: maxY - minY };
}

/**
 * Compute the largest axis-aligned rectangle fully inscribed within the
 * rotated image (no black corners). Centered at the image center.
 *
 * For a W×H image rotated by θ:
 *   innerW = W·cos|θ| − H·sin|θ|
 *   innerH = H·cos|θ| − W·sin|θ|
 *
 * Returns dimensions clamped to ≥ 0 (at extreme angles no rect fits).
 */
export function getInnerRect(imgW: number, imgH: number, angleDeg: number): { width: number; height: number } {
	const rad = (Math.abs(angleDeg) * Math.PI) / 180;
	const cosA = Math.cos(rad);
	const sinA = Math.sin(rad);
	const cos2A = Math.cos(2 * rad);

	if (cos2A <= 1e-6) {
		// Near 45°: degenerate case, use the short side as both dimensions
		const s = Math.min(imgW, imgH);
		return { width: s, height: s };
	}

	return {
		width: Math.max(0, (imgW * cosA - imgH * sinA) / cos2A),
		height: Math.max(0, (imgH * cosA - imgW * sinA) / cos2A)
	};
}
