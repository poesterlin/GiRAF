<script lang="ts" generics="T">
	import type { Snippet } from 'svelte';

	interface Props {
		items: T[];
		onMore: () => void;
		header?: Snippet;
		footer?: Snippet;
		empty: Snippet;
		item: Snippet<[{ item: T; i: number }]>;
	}

	const { items, onMore, header, footer, empty, item: itemSnippet }: Props = $props();
	let scroller = $state<HTMLDivElement>();
	let sentinel = $state<HTMLDivElement>();

	// Ask for the next page well before the end. Observing again after every page re-checks a
	// sentinel that is still in view, so short pages keep loading until the screen is filled.
	$effect(() => {
		items.length;
		if (!scroller || !sentinel) return;
		const observer = new IntersectionObserver((entries) => {
			if (entries.some((entry) => entry.isIntersecting)) onMore();
		}, { root: scroller, rootMargin: '0px 0px 800px 0px' });
		observer.observe(sentinel);
		return () => observer.disconnect();
	});
</script>

<div bind:this={scroller} class="h-full w-full overflow-y-auto">
	{#if header}
		{@render header()}
	{/if}
	{#each items as item, i}
		<div class="scroller-item">{@render itemSnippet({ item, i })}</div>
	{:else}
		{@render empty()}
	{/each}
	<div bind:this={sentinel} aria-hidden="true"></div>
	{#if footer}
		{@render footer()}
	{/if}
</div>

<style>
	/* Off-screen items skip rendering; the browser remembers each one's size once it has been seen. */
	.scroller-item { display: flow-root; content-visibility: auto; contain-intrinsic-size: auto 600px; }
</style>
