/**
 * Selection while a finger or mouse drags across a photo grid, as in Google Photos.
 * The range always runs from the photo the drag started on to the one under the
 * pointer, so dragging back shrinks it again. Starting on a selected photo deselects.
 */
export function dragSelection<T>(
	baseline: ReadonlySet<T>,
	items: readonly T[],
	startIndex: number,
	currentIndex: number,
	adding: boolean,
	selectable: (item: T) => boolean = () => true
) {
	const next = new Set(baseline);
	const start = Math.max(0, Math.min(startIndex, currentIndex));
	const end = Math.min(items.length - 1, Math.max(startIndex, currentIndex));
	for (let i = start; i <= end; i++) {
		const item = items[i];
		if (!selectable(item)) continue;
		if (adding) next.add(item);
		else next.delete(item);
	}
	return next;
}

/**
 * Auto-scroll speed in pixels per tick while dragging near the top or bottom of a
 * scroll container. Negative scrolls up. Faster the deeper the pointer is in the edge.
 */
export function autoScrollSpeed(clientY: number, top: number, bottom: number, maxSpeed = 24) {
	const zone = Math.min(80, (bottom - top) / 3);
	if (zone <= 0) return 0;
	if (clientY < top + zone) return -Math.ceil(maxSpeed * Math.min(1, (top + zone - clientY) / zone));
	if (clientY > bottom - zone) return Math.ceil(maxSpeed * Math.min(1, (clientY - (bottom - zone)) / zone));
	return 0;
}
