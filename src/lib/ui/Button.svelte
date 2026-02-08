<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		children: Snippet;
		onclick?: () => void;
		title?: string;
		type?: 'button' | 'submit' | 'reset';
		'aria-label'?: string;
		disabled?: boolean;
		flash?: boolean;
		class?: string;
	}

	const { children, onclick, title, type = 'button', disabled = false, 'aria-label': ariaLabel, flash = false, class: className = '' }: Props = $props();
</script>

<button
	{onclick}
	{type}
	aria-label={ariaLabel}
	disabled={disabled}
	class="rounded-md border-2 flex flex-row items-center justify-between border-neutral-500/30 bg-linear-to-r from-neutral-800 to-neutral-900 p-2.5 transition-colors hover:border-neutral-200 hover:from-neutral-600 hover:to-neutral-800 focus:ring-2 focus:ring-neutral-200 {className}"
	class:key-flash={flash}
	{title}
>
	{@render children()}
</button>

<style>
	.key-flash {
		animation: keyFlash 180ms ease-out;
	}

	@keyframes keyFlash {
		0% {
			border-color: rgba(229, 229, 229, 0.6);
			box-shadow:
				0 0 0 2px rgba(229, 229, 229, 0.2),
				0 8px 16px rgba(10, 10, 10, 0.35);
			filter: brightness(1.05);
		}
		45% {
			border-color: rgba(250, 250, 250, 0.85);
			box-shadow:
				0 0 0 2px rgba(250, 250, 250, 0.35),
				0 10px 24px rgba(10, 10, 10, 0.45);
			filter: brightness(1.18);
		}
		100% {
			border-color: rgba(229, 229, 229, 0.3);
			box-shadow: none;
			filter: brightness(1);
		}
	}
</style>
