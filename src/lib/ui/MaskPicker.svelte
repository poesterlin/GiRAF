<script lang="ts">
	import { edits } from '$lib/state/editing.svelte';
	import { maskKind, type MaskKind } from '$lib/local-masks';
	import MaskPreview from './MaskPreview.svelte';
	import IconChevronDown from '@tabler/icons-svelte/icons/chevron-down';
	import IconCheck from '@tabler/icons-svelte/icons/check';
	let { indices, selected, aspect, onselect }: { indices: number[]; selected: number; aspect?: number; onselect: (index: number) => void } = $props();
	let open = $state(false);
	let root = $state<HTMLDivElement>();
	let trigger = $state<HTMLButtonElement>();
	const kinds: Record<MaskKind, string> = { ELI: 'Ellipse', RECT: 'Rectangle', GRADIENT: 'Gradient' };
	function choose(index: number) {
		onselect(index);
		open = false;
		trigger?.focus();
	}
</script>

<svelte:window
	onpointerdown={(event) => {
		if (open && !root?.contains(event.target as Node)) open = false;
	}}
	onkeydown={(event) => {
		if (event.key === 'Escape' && open) {
			open = false;
			trigger?.focus();
		}
	}}
/>
{#snippet mask(index: number)}
	<MaskPreview {index} {aspect} />
	<span class="min-w-0 flex-1">
		<span class="block truncate text-sm text-neutral-100">{edits.pp3.Locallab[`Name_${index}`]}</span>
		<span class="block text-[11px] text-neutral-500">{kinds[maskKind(edits.pp3, index)]}{edits.pp3.Locallab[`Activ_${index}`] ? '' : ' · Off'}</span>
	</span>
{/snippet}

<div bind:this={root} class="relative min-w-0 flex-1">
	<button
		bind:this={trigger}
		type="button"
		class="flex min-h-12 w-full items-center gap-3 rounded-lg bg-neutral-800/80 px-2.5 text-left transition-colors hover:bg-neutral-800 focus-visible:outline-2 focus-visible:outline-white"
		aria-haspopup="listbox"
		aria-expanded={open}
		aria-label="Selected mask"
		onclick={() => (open = !open)}
	>
		{@render mask(selected)}
		<IconChevronDown size={16} class={`shrink-0 text-neutral-400 transition-transform ${open ? 'rotate-180' : ''}`} />
	</button>
	{#if open}
		<div
			role="listbox"
			aria-label="Masks"
			class="absolute inset-x-0 top-full z-40 mt-1 max-h-72 overflow-y-auto rounded-lg border border-neutral-600 bg-neutral-800 p-1 shadow-2xl shadow-black/80"
		>
			{#each indices as index (index)}
				<button
					type="button"
					role="option"
					aria-selected={index === selected}
					class="flex min-h-12 w-full items-center gap-3 rounded px-2 text-left hover:bg-neutral-700"
					class:bg-neutral-700={index === selected}
					onclick={() => choose(index)}
				>
					{@render mask(index)}
					{#if index === selected}<IconCheck size={16} class="shrink-0 text-neutral-300" />{/if}
				</button>
			{/each}
		</div>
	{/if}
</div>
