<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import Modal from '$lib/ui/Modal.svelte';
	import { fly } from 'svelte/transition';
	import { IconFilter } from '$lib/ui/icons';

	interface Props {
		onClose: () => void;
	}

	const filters = [
		{ name: 'All Images', value: 'none' },
		{ name: 'Changed since last export', value: 'changed' },
		{ name: 'No Archived', value: 'no-archived' },
		{ name: 'Only Archived', value: 'archived' },
		{ name: 'Only Unedited', value: 'unedited' },
		{ name: 'Only Edited', value: 'edited' },
	];

	let { onClose }: Props = $props();

	function applyFilter(filterValue: string) {
		const newUrl = new URL(page.url);
		newUrl.searchParams.set('filter', filterValue);
		if (filterValue !== 'unedited' || page.url.searchParams.get('filter') !== 'unedited') {
			newUrl.searchParams.delete('uneditedSince');
		}
		goto(newUrl);
		onClose();
	}
</script>

<Modal {onClose} class="p-0">
	<div class="p-5">
		<h2 class="mb-6 text-xl font-semibold text-neutral-100">Filters</h2>
		<div class="grid grid-cols-2 gap-3 sm:grid-cols-3">
			{#each filters as filter, i (filter.value)}
				<button
					in:fly={{ y: 20, duration: 200, delay: i * 50 }}
					class="flex items-center justify-center gap-2 rounded-lg border border-neutral-700 bg-neutral-800 px-4 py-3 text-center text-sm font-medium text-neutral-200 transition-all hover:bg-neutral-700 focus:outline-none focus:ring-2 focus:ring-neutral-500"
					class:!bg-neutral-600={page.url.searchParams.get('filter') === filter.value ||
						(page.url.searchParams.get('filter') === null && filter.value === 'none')}
					onclick={() => applyFilter(filter.value)}
				>
					<IconFilter class="h-4 w-4 flex-shrink-0" />
					<span>{filter.name}</span>
				</button>
			{/each}
		</div>
	</div>
</Modal>
