import type { Action } from 'svelte/action';

/** Maximum adjustment groups kept expanded on desktop. */
const MAX_OPEN_GROUPS = 4;

/**
 * Choose which open adjustment group to close once the limit is reached: the
 * group farthest from the one that was just opened, so the remaining groups
 * stay clustered around it. When two groups are equally far, the least
 * recently opened one closes. Returns the index of the group within `open`,
 * or -1 when there is nothing to close.
 */
export function farthestOpenGroupIndex(anchorPosition: number, open: readonly { position: number; rank: number }[]): number {
	let victim = -1;
	let farthest = -1;
	for (let index = 0; index < open.length; index += 1) {
		const distance = Math.abs(open[index].position - anchorPosition);
		if (distance > farthest || (distance === farthest && victim >= 0 && open[index].rank < open[victim].rank)) {
			victim = index;
			farthest = distance;
		}
	}
	return victim;
}

/**
 * Keep at most four adjustment groups expanded on desktop. When another group
 * opens past that limit, the open group farthest from it closes, so the
 * remaining groups stay clustered around the newly opened one.
 */
export const limitExpandedGroups: Action<HTMLElement> = (container) => {
	const desktop = window.matchMedia('(min-width: 1024px)');
	/** Higher ranks mark more recently opened groups. */
	const recency = new Map<HTMLDetailsElement, number>();
	let rank = 0;

	const groups = () => Array.from(container.querySelectorAll<HTMLDetailsElement>('details[data-adjustment-group]'));
	const openGroups = () => groups().filter((details) => details.open);

	function forgetClosed() {
		for (const details of recency.keys()) {
			if (!details.open || !container.contains(details)) recency.delete(details);
		}
	}

	function closeFarthestFrom(anchor: HTMLDetailsElement) {
		while (openGroups().length > MAX_OPEN_GROUPS) {
			const positions = new Map(groups().map((details, index) => [details, index] as const));
			const others = openGroups()
				.filter((details) => details !== anchor)
				.map((details) => ({ details, position: positions.get(details) ?? 0, rank: recency.get(details) ?? 0 }));
			const victim = others[farthestOpenGroupIndex(positions.get(anchor) ?? 0, others)];
			if (!victim) return;
			victim.details.open = false;
		}
	}

	function enforceLimit(anchor?: HTMLDetailsElement) {
		if (!desktop.matches) return;
		const open = openGroups();
		if (open.length <= MAX_OPEN_GROUPS) return;
		const reference =
			anchor && open.includes(anchor) ? anchor : open.reduce((newest, details) => ((recency.get(details) ?? 0) > (recency.get(newest) ?? 0) ? details : newest), open[0]);
		closeFarthestFrom(reference);
	}

	function remember(details: HTMLDetailsElement) {
		forgetClosed();
		if (details.open) recency.set(details, ++rank);
		enforceLimit(details);
	}

	function toggled(event: Event) {
		const details = event.target;
		if (details instanceof HTMLDetailsElement && details.hasAttribute('data-adjustment-group')) remember(details);
	}

	function clicked(event: MouseEvent) {
		if (!desktop.matches || event.defaultPrevented || !(event.target instanceof Element)) return;
		const details = event.target.closest('summary')?.parentElement;
		if (!(details instanceof HTMLDetailsElement) || !details.hasAttribute('data-adjustment-group')) return;
		// Enforce immediately, rather than showing a fifth group until the
		// browser dispatches its deferred native toggle event.
		event.preventDefault();
		details.open = !details.open;
		remember(details);
	}

	function resized() {
		enforceLimit();
	}

	container.addEventListener('toggle', toggled, true);
	container.addEventListener('click', clicked);
	desktop.addEventListener('change', resized);
	enforceLimit();
	return {
		destroy() {
			container.removeEventListener('toggle', toggled, true);
			container.removeEventListener('click', clicked);
			desktop.removeEventListener('change', resized);
		}
	};
};
