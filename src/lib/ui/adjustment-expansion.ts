import type { Action } from 'svelte/action';

/** Keep the four most recently opened adjustment groups expanded on desktop. */
export const limitExpandedGroups: Action<HTMLElement> = (container) => {
	const desktop = window.matchMedia('(min-width: 1024px)');
	let opened: HTMLDetailsElement[] = [];

	function enforceLimit() {
		opened = opened.filter((details) => details.open && container.contains(details));
		if (!desktop.matches) return;
		for (const details of container.querySelectorAll<HTMLDetailsElement>('details[data-adjustment-group][open]')) {
			if (!opened.includes(details)) opened.push(details);
		}
		while (opened.length > 4) opened.shift()!.open = false;
	}

	function remember(details: HTMLDetailsElement) {
		opened = opened.filter((other) => other !== details);
		if (details.open) opened.push(details);
		enforceLimit();
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

	container.addEventListener('toggle', toggled, true);
	container.addEventListener('click', clicked);
	desktop.addEventListener('change', enforceLimit);
	enforceLimit();
	return {
		destroy() {
			container.removeEventListener('toggle', toggled, true);
			container.removeEventListener('click', clicked);
			desktop.removeEventListener('change', enforceLimit);
		}
	};
};
