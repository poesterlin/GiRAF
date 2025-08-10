// place files you want to import through the `$lib` alias in this folder.
export function throttle<T extends (...args: any[]) => void>(func: T, delay: number): T {
    let lastCall = 0;
    return function (...args: any[]) {
        const now = Date.now();
        if (now - lastCall >= delay) {
            lastCall = now;
            return func(...args);
        }
    } as T;
}