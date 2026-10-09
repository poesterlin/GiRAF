<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import Modal from '$lib/ui/Modal.svelte';
	import { editorFilterQuery, readEditorFilters, type EditorFilters } from '$lib/editor-filters';
	let { onClose }: { onClose: () => void } = $props();
	let filters = $state<EditorFilters>(readEditorFilters(page.url.searchParams));
	function localTimestamp(value: string | Date) {
		const date = new Date(value);
		const pad = (value: number) => String(value).padStart(2, '0');
		return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
	}
	let customTimestamp = $state(localTimestamp(filters.since ?? new Date()));
	const validCustomTimestamp = $derived(!!customTimestamp && Number.isFinite(new Date(customTimestamp).getTime()));
	function changeCutoff(event: Event) {
		const cutoff = (event.target as HTMLSelectElement).value as EditorFilters['cutoff'];
		if (cutoff === 'custom' && filters.cutoff !== 'custom') {
			const lastExport = page.data.image?.lastExportedAt;
			customTimestamp = localTimestamp(filters.cutoff === 'export' ? lastExport ?? new Date() : filters.since ?? new Date());
		}
		if (cutoff === 'workflow' && filters.cutoff !== 'workflow') filters.since = new Date().toISOString();
		filters.cutoff = cutoff;
	}
	const statuses = [{ value: 'any', label: 'Any' }, { value: 'unedited', label: 'Unedited' }, { value: 'edited', label: 'Edited' }] as const;
	const archives = [{ value: 'any', label: 'Any' }, { value: 'hide', label: 'Hide archived' }, { value: 'only', label: 'Only archived' }] as const;
	function apply() {
		if (filters.edited === 'edited' && filters.cutoff === 'custom' && !validCustomTimestamp) return;
		const url = new URL(page.url);
		for (const key of ['filter', 'uneditedSince', 'edited', 'archived', 'cutoff', 'since', 'imported']) url.searchParams.delete(key);
		const selected = { ...filters };
		if (selected.cutoff === 'custom' && validCustomTimestamp) selected.since = new Date(customTimestamp).toISOString();
		if (selected.cutoff === 'workflow' && selected.edited === 'edited') selected.since ??= new Date().toISOString();
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
			{#if filters.edited === 'edited'}
				<label class="flex flex-col gap-2 text-sm text-neutral-300">Editing cutoff
					<select value={filters.cutoff} onchange={changeCutoff} class="min-h-12 rounded-xl border border-neutral-600 bg-neutral-900 px-3 text-neutral-100">
						<option value="workflow">Current timestamp</option>
						<option value="export">Last export</option>
						<option value="custom">Custom timestamp</option>
					</select>
				</label>
				{#if filters.cutoff === 'custom'}
					<label class="flex flex-col gap-2 text-sm text-neutral-300">Cutoff date and time
						<input type="datetime-local" step="1" required bind:value={customTimestamp} class="min-h-12 w-full min-w-0 rounded-xl border border-neutral-600 bg-neutral-900 px-3 text-neutral-100 [color-scheme:dark]" />
					</label>
				{/if}
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
		<label class="flex min-h-12 cursor-pointer items-center gap-3 font-semibold text-neutral-300">
			<input type="checkbox" bind:checked={filters.newlyImported} class="h-5 w-5 accent-neutral-200" />
			Newly imported since last session export
		</label>
		<div class="flex justify-between gap-3">
			<button type="button" class="min-h-12 rounded-xl border border-neutral-600 px-5 font-semibold" onclick={() => (filters = { edited: 'any', archived: 'hide', cutoff: 'workflow' })}>Reset filters</button>
			<button type="button" disabled={filters.edited === 'edited' && filters.cutoff === 'custom' && !validCustomTimestamp} class="min-h-12 rounded-xl bg-neutral-100 px-5 font-semibold text-neutral-950 disabled:opacity-40" onclick={apply}>Apply</button>
		</div>
	</div>
</Modal>
