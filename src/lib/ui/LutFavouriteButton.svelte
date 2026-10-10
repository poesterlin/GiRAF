<script lang="ts">
	import { onMount } from 'svelte';
	import { lutFavourites } from '$lib/state/lut-favourites.svelte';
	import { IconStar, IconStarFilled } from './icons';

	let { path, name, class: className = '' }: { path: string; name: string; class?: string } = $props();
	const favourite = $derived(lutFavourites.paths.includes(path));
	onMount(() => lutFavourites.load());
</script>

<button type="button" aria-label={`${favourite ? 'Remove' : 'Add'} ${name} ${favourite ? 'from' : 'to'} favourites`} aria-pressed={favourite} onclick={() => lutFavourites.toggle(path)} class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-neutral-100 focus-visible:outline-2 focus-visible:outline-white {className}">
	<span class="rounded-full bg-neutral-950/80 p-2 shadow-sm">{#if favourite}<IconStarFilled size={16} />{:else}<IconStar size={16} />{/if}</span>
</button>
