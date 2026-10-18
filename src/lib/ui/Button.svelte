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
	{disabled}
	class="flex flex-row items-center justify-between gap-2 rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-2 text-sm font-medium text-neutral-200 outline-hidden transition-all hover:border-neutral-700 hover:bg-neutral-800 focus:ring-2 focus:ring-neutral-700/50 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 {className}"
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
			border-color: rgba(229, 229, 229, 0.4);
			background-color: rgba(64, 64, 64, 1);
			transform: scale(0.98);
		}
		45% {
			border-color: rgba(250, 250, 250, 0.8);
			background-color: rgba(82, 82, 82, 1);
			transform: scale(1.02);
		}
		100% {
			border-color: rgba(38, 38, 38, 1);
			background-color: rgba(23, 23, 23, 1);
			transform: scale(1);
		}
	}
</style>
