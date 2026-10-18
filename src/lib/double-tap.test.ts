import { expect, test } from 'bun:test';
import { DoubleTapDetector } from './double-tap';

function pointer(type: string, x: number, y: number, id = 1, pointerType = 'touch') {
	return { type, clientX: x, clientY: y, pointerId: id, pointerType } as PointerEvent;
}

function tap(detector: DoubleTapDetector, x = 100, y = 100, id = 1) {
	detector.down(pointer('pointerdown', x, y, id), 1);
	return detector.up(pointer('pointerup', x, y, id));
}

test('two quick taps in the same place are a double tap', () => {
	const detector = new DoubleTapDetector();
	expect(tap(detector)).toBe(false);
	expect(tap(detector, 105, 100, 2)).toBe(true);
});

test('a double tap is consumed, so a third tap starts over', () => {
	const detector = new DoubleTapDetector();
	tap(detector);
	expect(tap(detector)).toBe(true);
	expect(tap(detector)).toBe(false);
});

test('taps far apart are not a double tap', () => {
	const detector = new DoubleTapDetector();
	tap(detector, 100, 100);
	expect(tap(detector, 300, 100)).toBe(false);
});

test('a drag is not a tap and breaks the sequence', () => {
	const detector = new DoubleTapDetector();
	tap(detector);
	detector.down(pointer('pointerdown', 100, 100), 1);
	detector.move(pointer('pointermove', 140, 100));
	expect(detector.up(pointer('pointerup', 140, 100))).toBe(false);
	expect(tap(detector)).toBe(false);
});

test('a second finger cancels the sequence', () => {
	const detector = new DoubleTapDetector();
	tap(detector);
	detector.down(pointer('pointerdown', 100, 100, 2), 2);
	expect(detector.up(pointer('pointerup', 100, 100, 2))).toBe(false);
	expect(tap(detector)).toBe(false);
});

test('pointercancel and mixed pointer types never count', () => {
	const detector = new DoubleTapDetector();
	tap(detector);
	detector.down(pointer('pointerdown', 100, 100), 1);
	expect(detector.up(pointer('pointercancel', 100, 100))).toBe(false);

	tap(detector);
	detector.down(pointer('pointerdown', 100, 100, 1, 'mouse'), 1);
	expect(detector.up(pointer('pointerup', 100, 100, 1, 'mouse'))).toBe(false);
});

test('reset forgets the previous tap', () => {
	const detector = new DoubleTapDetector();
	tap(detector);
	detector.reset();
	expect(tap(detector)).toBe(false);
});
