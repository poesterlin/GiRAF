<script lang="ts">
	import { uniqueArray } from '$lib';
	import { setLut, toBase64 } from '$lib/pp3-utils';
	import { edits } from '$lib/state/editing.svelte';
	import Modal from './Modal.svelte';

	interface Props {
        imageId: string;
		luts: {
			name: string;
			path: string;
			tags: string[];
		}[];
		onClose: () => void;
	}

	let { luts, onClose, imageId }: Props = $props();

	let selectedTags = $state<string[]>([]);
	const filteredLuts = $derived(luts.filter((lut) => selectedTags.length === 0 || selectedTags.every((tag) => lut.tags.includes(tag))));
	const avaliableTags = $derived(
		uniqueArray(filteredLuts.flatMap((lut) => lut.tags)).sort((a, b) => (selectedTags.includes(a) ? -1 : selectedTags.includes(b) ? 1 : a.localeCompare(b)))
	);

	function toggleTag(tag: string) {
		if (selectedTags.includes(tag)) {
			selectedTags = selectedTags.filter((t) => t !== tag);
		} else {
			selectedTags.push(tag);
		}
	}

	function select(path: string) {
		setLut(edits.pp3, path);
		edits.pushHistory();
		onClose();
	}
</script>

<Modal {onClose} class="w-4xl text-neutral-200">
	<div class="sticky top-0 z-10 mb-4 rounded-tl-lg bg-gray-100 p-4">
		<h1 class="text-lg font-semibold text-black">Select a Lut</h1>
		<div class="flex flex-wrap gap-2">
			{#each avaliableTags as tag}
				<button
					class="rounded bg-gray-200 px-3 py-1 text-black hover:bg-gray-300 focus:ring-2 focus:ring-blue-500 focus:outline-none"
					onclick={() => toggleTag(tag)}
					class:selected={selectedTags.includes(tag)}
				>
					{tag}
				</button>
			{/each}
		</div>
	</div>
	<div class="image-grid">
		{#each filteredLuts as lut}
			{@const pp3 = JSON.parse(JSON.stringify(edits.pp3))}
			{@const edited = setLut(pp3, lut.path)}
			<button onclick={() => select(lut.path)} class="flex flex-col items-center">
				<img src="/api/images/{imageId}/edit?preview&config={toBase64(edited)}" alt="" class="h-32" loading="lazy" />
				<h2 class="truncate">{lut.name}</h2>
			</button>
		{/each}
	</div>
</Modal>

<style>
	.image-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
		gap: 1rem;
	}

	.selected {
		background-color: #4a90e2;
	}
</style>
