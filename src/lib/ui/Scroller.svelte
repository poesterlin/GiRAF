<script lang="ts" generics="T">
	import { onMount, tick, type Snippet } from 'svelte';

	// export let items: any[];
	interface Props {
		items: T[];
		onMore: () => void;
        footer: Snippet;
        empty: Snippet;
        item: Snippet<[{ item: T, i: number }]>;
	}

	const { items, onMore,  footer, empty, item: itemSnippet }: Props = $props();

	export function capture() {
		const scroll = scroller.scrollTop;
		return { a, b, top, bottom, heights, scroll };
	}

	export async function restore(state: { a: number; b: number; top: number; bottom: number; heights: number[]; scroll: number }) {
		a = state.a;
		b = state.b;
		top = state.top;
		bottom = state.bottom;
		heights = state.heights;

		await tick();
		scroller.scrollTo(0, state.scroll);
	}

	let viewport: HTMLDivElement;
	let scroller: HTMLDivElement;
	let content: HTMLDivElement;

	let a = $state(0);
	let b = $state(items.length);
	let offset = $state(0);
	let top = $state(0);
	let bottom = $state(0);
	let heights = $state<number[]>([]);

	let average = $derived(heights.reduce((a, b) => a + b, 0) / heights.length);

	function measure(node: HTMLDivElement, id: number) {
		const height = node.clientHeight;
		const current_height = heights[id];

		if (current_height !== height) {
			if (current_height !== undefined) {
				// adjust scroll to account for resized image
				if (node.getBoundingClientRect().top < scroller.getBoundingClientRect().top) {
					scroller.scrollTop += height - current_height;
				}
			}

			heights[id] = height;
		}
	}

	function handle_resize() {
		offset = content.offsetTop;
		handle_scroll();
	}

	function handle_scroll() {
		let i = 0;
		let acc = 0;

		for (; i < items.length; i += 1) {
			const height = heights[i] ?? average;

			if (acc + height > scroller.scrollTop - offset) {
				a = i;
				top = acc;
				break;
			}
			acc += height;
		}

		for (; i <= items.length; i += 1) {
			if (acc >= scroller.scrollTop + viewport.clientHeight - offset + 200) {
				b = i;
				break;
			}
			acc += heights[i] ?? average;
		}

		bottom = 0;
		for (; i < items.length; i += 1) {
			bottom += heights[i] ?? average;
		}

		const remaining = scroller.scrollHeight - (scroller.scrollTop + viewport.clientHeight);
		if (remaining < 500) {
			onMore();
		}
	}

	onMount(handle_resize);
</script>

<svelte:window on:resize={handle_resize} />

<div bind:this={viewport} class="h-full w-full overflow-hidden">
	<div bind:this={scroller} class="h-full w-full overflow-y-scroll" style="overflow-anchor: none" onscroll={handle_scroll}>

		<div bind:this={content} style:padding-top="{top}px" style:padding-bottom="{bottom}px">
			{#each items.slice(a, b) as item, i (item)}
				<div class="flow-root" data-item-id={a + i} use:measure={a + i}>
					{@render itemSnippet({ item, i: a + i })}
				</div>
			{:else}
				{@render empty()}
			{/each}
		</div>

		{@render footer()}
	</div>
</div>
