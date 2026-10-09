<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import Modal from '$lib/ui/Modal.svelte';
	import { editorFilterQuery, readEditorFilters, type EditorFilters } from '$lib/editor-filters';
	let { onClose }: { onClose: () => void } = $props();
	let filters = $state<EditorFilters>(readEditorFilters(page.url.searchParams));
	const statuses = [{ value: 'any', label: 'Any' }, { value: 'unedited', label: 'Unedited' }, { value: 'edited', label: 'Edited' }] as const;
	const archives = [{ value: 'any', label: 'Any' }, { value: 'hide', label: 'Hide archived' }, { value: 'only', label: 'Only archived' }] as const;
	function apply() {
		const url = new URL(page.url);
		for (const key of ['filter', 'uneditedSince', 'edited', 'archived', 'cutoff', 'since']) url.searchParams.delete(key);
		const selected = { ...filters };
		if (selected.cutoff === 'workflow' && selected.edited !== 'any') selected.since ??= new Date().toISOString();
		for (const [key, value] of new URLSearchParams(editorFilterQuery(selected).slice(1))) url.searchParams.set(key, value);
		goto(url);
		onClose();
	}
</script>

<Modal {onClose} class="p-0">
	<div class="space-y-6 p-5">
		<h2 class="text-xl font-semibold text-white">Filters</h2>
		<fieldset class="space-y-3">
			<legend class="mb-3 font-semibold text-neutral-300">Edited</legend>
			<div class="grid grid-cols-3 gap-2">
				{#each statuses as status}
					<button type="button" class="min-h-12 rounded-xl border border-neutral-600 px-3 text-sm font-semibold" class:bg-neutral-100={filters.edited === status.value} class:text-neutral-950={filters.edited === status.value} aria-pressed={filters.edited === status.value} onclick={() => (filters.edited = status.value)}>{status.label}</button>
				{/each}
			</div>
			{#if filters.edited !== 'any'}
				<label class="flex flex-col gap-2 text-sm text-neutral-300">Editing cutoff
					<select bind:value={filters.cutoff} class="min-h-12 rounded-xl border border-neutral-600 bg-neutral-900 px-3 text-neutral-100">
						<option value="workflow">Start of this workflow</option>
						<option value="export">Last export</option>
					</select>
				</label>
			{/if}
		</fieldset>
		<fieldset>
			<legend class="mb-3 font-semibold text-neutral-300">Archived</legend>
			<div class="grid grid-cols-3 gap-2">
				{#each archives as status}
					<button type="button" class="min-h-12 rounded-xl border border-neutral-600 px-3 text-sm font-semibold" class:bg-neutral-100={filters.archived === status.value} class:text-neutral-950={filters.archived === status.value} aria-pressed={filters.archived === status.value} onclick={() => (filters.archived = status.value)}>{status.label}</button>
				{/each}
			</div>
		</fieldset>
		<div class="flex justify-between gap-3">
			<button type="button" class="min-h-12 rounded-xl border border-neutral-600 px-5 font-semibold" onclick={() => (filters = { edited: 'any', archived: 'any', cutoff: 'workflow' })}>Clear filters</button>
			<button type="button" class="min-h-12 rounded-xl bg-neutral-100 px-5 font-semibold text-neutral-950" onclick={apply}>Apply</button>
		</div>
	</div>
</Modal>
