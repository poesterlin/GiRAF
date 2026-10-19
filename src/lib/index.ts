export function assert<T>(condition: T | undefined | null, message?: string): asserts condition is T {
	if (!condition) {
		throw new Error(message || 'Assertion failed');
	}
}

export function uniqueArray<T>(array: T[]): T[] {
	return Array.from(new Set(array));
}

export function clamp(v: number, lo: number, hi: number) {
	return Math.min(hi, Math.max(lo, v));
}
export function map(value: number, inMin: number, inMax: number, outMin: number, outMax: number): number {
	return outMin + ((value - inMin) * (outMax - outMin)) / (inMax - inMin);
}

/** A v4 UUID, also on plain HTTP origins where crypto.randomUUID is unavailable. */
export function randomId(): string {
	if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
	const bytes = crypto.getRandomValues(new Uint8Array(16));
	bytes[6] = (bytes[6] & 0x0f) | 0x40;
	bytes[8] = (bytes[8] & 0x3f) | 0x80;
	const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
