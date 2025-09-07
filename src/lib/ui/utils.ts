
export function preventDefault(fn: (event: Event, ...args: Array<unknown>) => void) {
	return function (event: Event, ...args: []) {
		event.preventDefault();
		// @ts-ignore
		return fn?.apply(this, args);
	};
}

export function stopPropagation(fn: (event: Event, ...args: Array<unknown>) => void) {
	return function (event: Event, ...args: []) {
		event.stopPropagation();
		// @ts-ignore
		return fn?.apply(this, args);
	};
}