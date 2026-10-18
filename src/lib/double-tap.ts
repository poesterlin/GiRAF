const TAP_MAX_MS = 300;
const TAP_MAX_MOVE = 10;
const DOUBLE_TAP_MAX_MS = 350;
const DOUBLE_TAP_MAX_DISTANCE = 32;

type TapPoint = { x: number; y: number; time: number };

/** Recognises a double tap from a stream of pointer events. Plain state, not reactive. */
export class DoubleTapDetector {
	private start: (TapPoint & { id: number }) | undefined;
	private last: (TapPoint & { type: string }) | undefined;

	reset() {
		this.start = undefined;
		this.last = undefined;
	}

	/** Call on pointerdown with the number of pointers now down. Several pointers cancel any tap. */
	down(event: PointerEvent, pointerCount: number) {
		if (pointerCount === 1) {
			this.start = { id: event.pointerId, x: event.clientX, y: event.clientY, time: performance.now() };
		} else {
			this.reset();
		}
	}

	/** Call on pointermove. Moving too far cancels the tap. */
	move(event: PointerEvent) {
		if (this.start && Math.hypot(event.clientX - this.start.x, event.clientY - this.start.y) > TAP_MAX_MOVE) this.reset();
	}

	/** Call on pointerup or pointercancel. Returns true when this tap completes a double tap. */
	up(event: PointerEvent) {
		const now = performance.now();
		const start = this.start;
		const last = this.last;
		this.start = undefined;
		const isTap =
			event.type === 'pointerup' && start?.id === event.pointerId && now - start.time < TAP_MAX_MS && Math.hypot(event.clientX - start.x, event.clientY - start.y) <= TAP_MAX_MOVE;
		if (!isTap) {
			this.last = undefined;
			return false;
		}
		if (last && last.type === event.pointerType && now - last.time < DOUBLE_TAP_MAX_MS && Math.hypot(event.clientX - last.x, event.clientY - last.y) < DOUBLE_TAP_MAX_DISTANCE) {
			this.last = undefined;
			return true;
		}
		this.last = { x: event.clientX, y: event.clientY, time: now, type: event.pointerType };
		return false;
	}
}
