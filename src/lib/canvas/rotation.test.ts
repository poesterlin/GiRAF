import { beforeAll, describe, expect, it } from 'bun:test';
import { applyToPoint, getInnerRect, getRotatedAABB, imgToRotMatrix } from '$lib/canvas/rotation';

class DOMMatrixPolyfill {
	a = 1;
	b = 0;
	c = 0;
	d = 1;
	e = 0;
	f = 0;

	private multiplySelf(m: DOMMatrixPolyfill) {
		const a = this.a * m.a + this.c * m.b;
		const b = this.b * m.a + this.d * m.b;
		const c = this.a * m.c + this.c * m.d;
		const d = this.b * m.c + this.d * m.d;
		const e = this.a * m.e + this.c * m.f + this.e;
		const f = this.b * m.e + this.d * m.f + this.f;
		this.a = a;
		this.b = b;
		this.c = c;
		this.d = d;
		this.e = e;
		this.f = f;
		return this;
	}

	translateSelf(tx: number, ty: number) {
		const m = new DOMMatrixPolyfill();
		m.e = tx;
		m.f = ty;
		return this.multiplySelf(m);
	}

	rotateSelf(angleDeg: number) {
		const rad = (angleDeg * Math.PI) / 180;
		const cos = Math.cos(rad);
		const sin = Math.sin(rad);
		const m = new DOMMatrixPolyfill();
		m.a = cos;
		m.b = sin;
		m.c = -sin;
		m.d = cos;
		return this.multiplySelf(m);
	}
}

class DOMPointPolyfill {
	constructor(public x: number, public y: number) {}

	matrixTransform(m: DOMMatrixPolyfill) {
		return new DOMPointPolyfill(m.a * this.x + m.c * this.y + m.e, m.b * this.x + m.d * this.y + m.f);
	}
}

beforeAll(() => {
	// Minimal 2D DOMMatrix/DOMPoint polyfill for Bun's test environment.
	// @ts-expect-error 
	(globalThis as typeof globalThis & { DOMMatrix?: typeof DOMMatrixPolyfill }).DOMMatrix =
		DOMMatrixPolyfill as unknown as typeof DOMMatrix;
	(globalThis as typeof globalThis & { DOMPoint?: typeof DOMPointPolyfill }).DOMPoint =
		DOMPointPolyfill as unknown as typeof DOMPoint;
});

describe('rotation geometry', () => {
	it('getRotatedAABB returns identity bounds at 0°', () => {
		const aabb = getRotatedAABB(100, 50, 0);
		expect(aabb.minX).toBeCloseTo(0);
		expect(aabb.minY).toBeCloseTo(0);
		expect(aabb.width).toBeCloseTo(100);
		expect(aabb.height).toBeCloseTo(50);
	});

	it('getRotatedAABB swaps dimensions at 90°', () => {
		const aabb = getRotatedAABB(120, 80, 90);
		expect(aabb.width).toBeCloseTo(80);
		expect(aabb.height).toBeCloseTo(120);
	});

	it('getRotatedAABB is symmetric for ±angles', () => {
		const aabbPos = getRotatedAABB(200, 100, 17);
		const aabbNeg = getRotatedAABB(200, 100, -17);
		expect(aabbPos.width).toBeCloseTo(aabbNeg.width);
		expect(aabbPos.height).toBeCloseTo(aabbNeg.height);
	});

	it('getInnerRect returns full image at 0°', () => {
		const inner = getInnerRect(300, 200, 0);
		expect(inner.width).toBeCloseTo(300);
		expect(inner.height).toBeCloseTo(200);
	});

	it('getInnerRect stays within image bounds for small angles', () => {
		const inner = getInnerRect(300, 200, 5);
		expect(inner.width).toBeLessThanOrEqual(300);
		expect(inner.height).toBeLessThanOrEqual(200);
		expect(inner.width).toBeGreaterThan(0);
		expect(inner.height).toBeGreaterThan(0);
	});

	it('getInnerRect handles the 45° degenerate case', () => {
		const inner = getInnerRect(300, 200, 45);
		expect(inner.width).toBeCloseTo(200);
		expect(inner.height).toBeCloseTo(200);
	});

	it('applyToPoint and imgToRotMatrix rotate around pivot', () => {
		const m = imgToRotMatrix(90, { x: 0, y: 0 });
		const p = applyToPoint(m, { x: 1, y: 0 });
		expect(p.x).toBeCloseTo(0);
		expect(p.y).toBeCloseTo(1);
	});
});
