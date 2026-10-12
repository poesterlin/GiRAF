export function assert<T>(condition: T | undefined | null, message?: string): asserts condition is T {
    if (!condition) {
        throw new Error(message || "Assertion failed");
    }
}

export function uniqueArray<T>(array: T[]): T[] {
    return Array.from(new Set(array));
}


export function clamp(v: number, lo: number, hi: number) {
    return Math.min(hi, Math.max(lo, v));
}
export function map(value: number, inMin: number, inMax: number, outMin: number, outMax: number): number {
    return outMin + (value - inMin) * (outMax - outMin) / (inMax - inMin);
}
