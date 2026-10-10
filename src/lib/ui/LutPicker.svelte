<script lang="ts">
	import { uniqueArray } from '$lib';
	import { setLut } from '$lib/pp3-utils';
	import { lutPreviewUrl } from '$lib/lut-preview';
	import { edits } from '$lib/state/editing.svelte';
	import { IconCheck, IconStar } from './icons';
	import { lutFavourites } from '$lib/state/lut-favourites.svelte';
	import LutFavouriteButton from './LutFavouriteButton.svelte';
	import { onMount } from 'svelte';
	import Modal from './Modal.svelte';

	interface Props {
		imageId: string;
		luts: { name: string; path: string; tags: string[] }[];
		onClose: () => void;
	}
	let { luts, onClose, imageId }: Props = $props();
	let search = $state('');
	let selectedTags = $state<string[]>([]);
	let favouritesOnly = $state(false);
	onMount(() => lutFavourites.load());
	const currentPath = String(edits.pp3.Film_Simulation?.ClutFilename ?? '');
	const currentName = luts.find((lut) => lut.path === currentPath)?.name ?? currentPath.split('/').pop()?.replace(/\.png$/i, '') ?? '';
	const currentPreview = lutPreviewUrl(imageId, $state.snapshot(edits.effectivePP3));
	// Keep the comparison stable while thumbnails arrive.
	const previews = luts.map((lut) => ({ ...lut, src: lutPreviewUrl(imageId, edits.previewWithLut(lut.path)) }));
	const tags = uniqueArray(luts.flatMap((lut) => lut.tags)).sort((a, b) => a.localeCompare(b));
	const filteredLuts = $derived(previews.filter((lut) =>
		`${lut.name} ${lut.tags.join(' ')}`.toLowerCase().includes(search.trim().toLowerCase()) &&
		selectedTags.every((tag) => lut.tags.includes(tag)) &&
		(!favouritesOnly || lutFavourites.paths.includes(lut.path))
	));
	function toggleTag(tag: string) {
		selectedTags = selectedTags.includes(tag) ? selectedTags.filter((value) => value !== tag) : [...selectedTags, tag];
	}
	function select(path: string) {
		setLut(edits.pp3, path);
		edits.disabledGroups = edits.disabledGroups.filter((group) => group !== 'look');
		edits.pushHistory(true);
		onClose();
	}
</script>

<Modal {onClose} class="w-[min(64rem,calc(100vw-1rem))] max-h-[90dvh] border border-neutral-700 text-neutral-200">
	<div class="sticky top-0 z-10 border-b border-neutral-800 bg-neutral-900 p-4 sm:p-6">
		<div class="mb-4 pr-12">
			<h1 class="text-lg font-semibold text-neutral-100">Choose a look</h1>
			<p class="mt-1 text-xs text-neutral-500">{filteredLuts.length} {filteredLuts.length === 1 ? 'look' : 'looks'}</p>
		</div>
		{#if currentPath}
			<div class="mb-4 flex items-center gap-3 rounded-xl border border-neutral-700 bg-neutral-950 p-2">
				<img src={currentPreview} alt="" class="h-16 w-20 rounded-lg object-contain" />
				<div class="min-w-0 flex-1"><p class="text-[10px] tracking-wider text-neutral-500 uppercase">Current look</p><p class="mt-1 truncate text-sm font-medium text-neutral-200" title={currentName}>{currentName}</p></div>
				<LutFavouriteButton path={currentPath} name={currentName} />
			</div>
		{/if}
		<input type="search" bind:value={search} aria-label="Search LUTs" placeholder="Search looks…" class="min-h-11 w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 text-sm text-neutral-100 placeholder:text-neutral-500 focus-visible:outline-2 focus-visible:outline-neutral-400" />
			<div class="mt-3 flex max-h-28 flex-wrap gap-2 overflow-y-auto" role="group" aria-label="Filter looks">
				<button type="button" aria-pressed={favouritesOnly} onclick={() => favouritesOnly = !favouritesOnly} class="flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-xs transition-colors focus-visible:outline-2 focus-visible:outline-white {favouritesOnly ? 'border-neutral-200 bg-neutral-200 text-neutral-950' : 'border-neutral-700 bg-neutral-800 text-neutral-400 hover:border-neutral-500 hover:text-neutral-100'}"><IconStar size={14} />Favourites</button>
				{#each tags as tag}
					<button type="button" aria-pressed={selectedTags.includes(tag)} onclick={() => toggleTag(tag)} class="min-h-9 rounded-full border px-3 text-xs transition-colors focus-visible:outline-2 focus-visible:outline-white {selectedTags.includes(tag) ? 'border-neutral-200 bg-neutral-200 text-neutral-950' : 'border-neutral-700 bg-neutral-800 text-neutral-400 hover:border-neutral-500 hover:text-neutral-100'}">{tag}</button>
				{/each}
				{#if selectedTags.length || search || favouritesOnly}
					<button type="button" onclick={() => { selectedTags = []; search = ''; favouritesOnly = false; }} class="min-h-9 px-2 text-xs text-neutral-400 hover:text-white focus-visible:outline-2 focus-visible:outline-white">Clear</button>
				{/if}
			</div>
	</div>
	<div class="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 sm:gap-4 sm:p-6 lg:grid-cols-4">
		{#each filteredLuts as lut (lut.path)}
			<div class="relative overflow-hidden rounded-xl border transition-colors {currentPath === lut.path ? 'border-neutral-300 bg-neutral-800' : 'border-neutral-800 bg-neutral-950 hover:border-neutral-500'}">
			<button type="button" onclick={() => select(lut.path)} aria-pressed={currentPath === lut.path} class="group block w-full text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-white">
				<div class="relative flex aspect-[4/3] items-center justify-center bg-neutral-950">
					<img src={lut.src} alt="" loading="lazy" decoding="async" class="h-full w-full object-contain" />
					{#if currentPath === lut.path}<span class="absolute top-2 right-2 rounded-full bg-neutral-100 p-1 text-neutral-950"><IconCheck size={14} /></span>{/if}
				</div>
				<div class="p-3"><h2 class="truncate text-xs font-medium text-neutral-200" title={lut.name}>{lut.name}</h2></div>
			</button>
			<LutFavouriteButton path={lut.path} name={lut.name} class="absolute top-1 left-1" />
			</div>
		{:else}
			<p class="col-span-full py-12 text-center text-sm text-neutral-500">No matching looks.</p>
		{/each}
	</div>
</Modal>
