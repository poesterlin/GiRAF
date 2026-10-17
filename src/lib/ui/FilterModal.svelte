<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import Modal from '$lib/ui/Modal.svelte';
	import { editorFilterQuery, editorTasks, matchingTask, readEditorFilters, taskFilters, type EditorFilters, type EditorTask } from '$lib/editor-filters';
	import IconSparkles from '@tabler/icons-svelte/icons/sparkles';
	import IconSearch from '@tabler/icons-svelte/icons/search';
	import IconUpload from '@tabler/icons-svelte/icons/upload';
	import IconBrush from '@tabler/icons-svelte/icons/brush';
	import IconArchive from '@tabler/icons-svelte/icons/archive';
	import IconPhoto from '@tabler/icons-svelte/icons/photo';
	import IconCheck from '@tabler/icons-svelte/icons/check';
	let { onClose }: { onClose: () => void } = $props();
	const current = readEditorFilters(page.url.searchParams);
	const icons = { new: IconSparkles, missed: IconSearch, export: IconUpload, touchup: IconBrush, archived: IconArchive, all: IconPhoto } as const;
	const preferenceKey = 'giraf_editor_archived';
	function readPreference() {
		if (current.archived !== 'only') return current.archived === 'any';
		try { return localStorage.getItem(preferenceKey) === 'include'; } catch { return false; }
	}
	let includeArchived = $state(readPreference());
	const currentTask = $derived(matchingTask(readEditorFilters(page.url.searchParams)));

	/** A running "To edit" list keeps its start; starting one fresh begins now. */
	function withStart(next: EditorFilters): EditorFilters {
		const { since: _, ...result } = next;
		if (result.show !== 'todo') return result;
		const sameList = current.show === 'todo' && !!current.newlyImported === !!result.newlyImported;
		return { ...result, since: sameList && current.since ? current.since : new Date().toISOString() };
	}
	function apply(next: EditorFilters) {
		const url = new URL(page.url);
		for (const key of ['filter', 'uneditedSince', 'edited', 'cutoff', 'show', 'since', 'archived', 'imported']) url.searchParams.delete(key);
		for (const [key, value] of new URLSearchParams(editorFilterQuery(withStart(next)).slice(1))) url.searchParams.set(key, value);
		return goto(url, { keepFocus: true, noScroll: true });
	}
	function choose(task: EditorTask) {
		void apply(taskFilters(task, includeArchived));
		onClose();
	}
	function setArchived(include: boolean) {
		includeArchived = include;
		try { localStorage.setItem(preferenceKey, include ? 'include' : 'hide'); } catch { /* Device storage may be unavailable. */ }
		// The open task follows the preference straight away.
		if (currentTask && currentTask.filters.archived !== 'only') void apply(taskFilters(currentTask, include));
	}

	let counts = $state<Record<string, number | undefined>>({});
	$effect(() => {
		const sessionId = page.data.session?.id;
		const include = includeArchived;
		if (!sessionId) return;
		const controller = new AbortController();
		for (const task of editorTasks) {
			fetch(`/api/sessions/${sessionId}/filter-count${editorFilterQuery(withStart(taskFilters(task, include)))}`, { signal: controller.signal })
				.then((response) => (response.ok ? response.json() : undefined))
				.then((result) => (counts[task.id] = result?.count))
				.catch(() => {});
		}
		return () => controller.abort();
	});
</script>

<Modal {onClose} class="p-0">
	<div class="p-5">
		<h2 class="mb-4 text-lg font-semibold text-white">Filter</h2>
		<div class="tasks">
			{#each editorTasks as task}
				{@const Icon = icons[task.id as keyof typeof icons]}
				<button type="button" class="task" aria-current={currentTask?.id === task.id ? 'true' : undefined} disabled={counts[task.id] === 0} onclick={() => choose(task)}>
					<Icon size={18} stroke={1.75} aria-hidden="true" />
					<span class="flex-1 text-left">{task.label}</span>
					{#if currentTask?.id === task.id}<IconCheck size={16} aria-label="current" />{/if}
					<span class="count">{counts[task.id] === 0 ? 'None' : (counts[task.id] ?? '')}</span>
				</button>
			{/each}
		</div>
		<div class="mt-4 flex items-center justify-between gap-4 border-t border-neutral-800 pt-4">
			<span id="archived-preference" class="text-sm text-neutral-400">Archived photos</span>
			<div class="segments" role="group" aria-labelledby="archived-preference">
				<button type="button" class="choice" aria-pressed={!includeArchived} onclick={() => setArchived(false)}>Hide</button>
				<button type="button" class="choice" aria-pressed={includeArchived} onclick={() => setArchived(true)}>Include</button>
			</div>
		</div>
	</div>
</Modal>

<style>
	.tasks { display: grid; gap: 2px; }
	.task { display: flex; align-items: center; gap: 12px; min-height: 48px; padding: 0 12px; border-radius: 10px; color: #d4d4d4; font-size: 14px; transition: background-color 120ms; }
	.task:hover:not(:disabled) { background: #262626; color: #fff; }
	.task:disabled { color: #8a8a8a; cursor: default; }
	.task:disabled :global(svg) { color: #6b6b6b; }
	.task[aria-current='true'] { background: #262626; color: #fff; }
	.task :global(svg) { flex-shrink: 0; color: #a3a3a3; }
	.task[aria-current='true'] :global(svg) { color: #fff; }
	.count { min-width: 2ch; color: #8a8a8a; font-size: 13px; font-variant-numeric: tabular-nums; text-align: right; }
	.task:focus-visible, .choice:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
	.segments { display: grid; grid-template-columns: 1fr 1fr; gap: 2px; padding: 3px; border-radius: 10px; background: #0a0a0a; }
	.choice { min-height: 44px; min-width: 76px; padding: 0 12px; border-radius: 8px; color: #a3a3a3; font-size: 13px; font-weight: 500; transition: background-color 120ms, color 120ms; }
	.choice:hover { color: #f5f5f5; }
	.choice[aria-pressed='true'] { background: #333; color: #fff; }
</style>
