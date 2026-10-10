// place files you want to import through the `$lib` alias in this folder.
export function throttle<T extends (...args: any[]) => void>(
    func: T,
    delay: number
): T {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let lastCallTime = 0;
    let pendingArgs: any[] | null = null;

    return function (...args: any[]): void {
        const now = Date.now();

        // Immediate execution if enough time has passed
        if (now - lastCallTime >= delay) {
            func(...args);
            lastCallTime = now;
        } else {
            // Save arguments for trailing call
            pendingArgs = args;
            
            // Schedule trailing call if not already scheduled
            if (!timeoutId) {
                timeoutId = setTimeout(() => {
                    if (pendingArgs !== null) {
                        func(...pendingArgs);
                        lastCallTime = Date.now();
                        pendingArgs = null;
                    }
                    timeoutId = null;
                }, delay - (now - lastCallTime));
            }
        }
    } as T;
}

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
