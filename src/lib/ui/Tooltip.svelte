<script lang="ts">
	import type { Snippet } from 'svelte';
	import { fade } from 'svelte/transition';

	interface Props {
		text: string;
		children: Snippet;
		position?: 'top' | 'bottom' | 'left' | 'right';
	}

	let { text, children, position = 'right' }: Props = $props();

	let visible = $state(false);

	const positionClasses = {
		top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
		bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
		left: 'right-full top-1/2 -translate-y-1/2 mr-2',
		right: 'left-full top-1/2 -translate-y-1/2 ml-2'
	};
</script>

<div
	class="relative flex items-center justify-center"
	onmouseenter={() => (visible = true)}
	onmouseleave={() => (visible = false)}
	onfocusin={() => (visible = true)}
	onfocusout={() => (visible = false)}
>
	{@render children()}

	{#if visible}
		<div
			transition:fade={{ duration: 100 }}
			class="pointer-events-none absolute z-50 rounded-md border border-neutral-800 bg-neutral-900 px-2 py-1 text-xs whitespace-nowrap text-neutral-200 shadow-xl backdrop-blur-md {positionClasses[
				position
			]}"
		>
			{text}
		</div>
	{/if}
</div>
