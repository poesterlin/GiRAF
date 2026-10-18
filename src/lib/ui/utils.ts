export function preventDefault<A extends unknown[]>(fn: (this: unknown, ...args: A) => void) {
	return function (this: unknown, event: Event, ...args: A) {
		event.preventDefault();
		return fn?.apply(this, args);
	};
}

export function stopPropagation<A extends unknown[]>(fn: (this: unknown, ...args: A) => void) {
	return function (this: unknown, event: Event, ...args: A) {
		event.stopPropagation();
		return fn?.apply(this, args);
	};
}
