<script lang="ts">
	import { navigating } from '$app/state';
	import { beforeNavigate } from '$app/navigation';

	/** Fast navigations finish before the bar would be noticed, so it waits a moment before showing. */
	const SHOW_AFTER_MS = 120;
	let visible = $state(false);
	let lastClicked: HTMLAnchorElement | undefined;
	let pending: HTMLAnchorElement | undefined;

	function clearPending() {
		pending?.removeAttribute('data-pending');
		pending?.removeAttribute('aria-busy');
		pending = undefined;
	}

	// The link itself shows it was pressed while the next page's data loads.
	beforeNavigate(({ type, willUnload }) => {
		clearPending();
		if (type !== 'link' || willUnload || !lastClicked?.isConnected) return;
		pending = lastClicked;
		pending.setAttribute('data-pending', '');
		pending.setAttribute('aria-busy', 'true');
	});

	$effect(() => {
		if (!navigating.to) {
			visible = false;
			clearPending();
			return;
		}
		const timer = setTimeout(() => (visible = true), SHOW_AFTER_MS);
		return () => clearTimeout(timer);
	});

	function rememberLink(event: MouseEvent) {
		lastClicked = (event.target as Element | null)?.closest?.('a[href]') ?? undefined;
	}
</script>

<svelte:window onclickcapture={rememberLink} />

{#if visible}
	<div class="navigation-progress" role="progressbar" aria-label="Loading page"></div>
{/if}
