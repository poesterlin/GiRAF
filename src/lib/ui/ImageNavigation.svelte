<script lang="ts">
	import { beforeNavigate, goto, invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import { edits } from '$lib/state/editing.svelte';
	import { editorFilterQuery, hasEditorFilters, readEditorFilters } from '$lib/editor-filters';
	import { IconChevronLeft, IconChevronRight, IconFilter, IconCheck, IconDeviceFloppy, IconRestore, IconArchive, IconArrowBackUp, IconArrowForwardUp } from './icons';
	import BasePP3 from '$lib/assets/client.pp3?raw';
	import { parsePP3 } from '$lib/pp3-utils';
	import { resetEditorTool } from '$lib/editor-reset';
	import { editorToolFromPath, editorToolUrl } from '$lib/editor-tools';
	import FilterModal from './FilterModal.svelte';
	import { app } from '$lib/state/app.svelte';
	import { getContext, tick } from 'svelte';
	import { editorHistoryKey, type EditorHistoryActions } from '$lib/editor-history';
	import Tooltip from './Tooltip.svelte';
	import PreviewLoading from './PreviewLoading.svelte';
	import type { PP3 } from '$lib/pp3-utils';
	let savedStyling: { imageId: string; settings: PP3; groups: string[]; strength: number } | undefined;
	let stylingToast: string | undefined;
	function captureStyling() {
		return { imageId: edits.currentImageId!, settings: $state.snapshot(edits.pp3), groups: [...edits.disabledGroups], strength: edits.editStrength };
	}
	function dismissStylingToast() {
		app.toasts = app.toasts.filter(toast => toast.id !== stylingToast);
		stylingToast = undefined;
	}
	let { busy = $bindable(false) }: { busy?: boolean } = $props();
	let showFilter = $state(false);
	let navigationError = $state('');
	let savedImage = $state<string>();
	let menu = $state<HTMLDetailsElement>();
	const historyActions = getContext<EditorHistoryActions | undefined>(editorHistoryKey);
	const filtered = $derived(hasEditorFilters(page.url.searchParams));
	const editingDisabled = $derived(busy || !!page.data.editorError || page.data.hasMatchingImages === false);
	function undo() { if (!editingDisabled && edits.canUndo) (historyActions?.undo ?? (() => edits.undo()))(); }
	function redo() { if (!editingDisabled && edits.canRedo) (historyActions?.redo ?? (() => edits.redo()))(); }
	beforeNavigate(() => { if (menu) menu.open = false; dismissStylingToast(); });
	async function save() {
		if (busy) return;
		busy = true; navigationError = '';
		try {
			const styling = edits.hasChanges ? captureStyling() : undefined;
			await edits.snapshot();
			if (styling) savedStyling = styling;
			savedImage = edits.currentImageId ?? undefined;
			await invalidateAll();
		}
		catch (error) { navigationError = String(error); }
		finally { busy = false; }
	}
	async function reset() {
		if (busy) return;
		if (menu) menu.open = false;
		busy = true; navigationError = ''; savedImage = undefined;
		try {
			await edits.snapshot();
			const activeTool = tool;
			const settings = resetEditorTool($state.snapshot(edits.pp3), parsePP3(page.data.image.importBaseline ?? BasePP3), activeTool, parsePP3(BasePP3));
			if (activeTool === 'adjustments') edits.reset(settings, page.data.image);
			else { edits.pp3 = settings; edits.pushHistory(true); }
			await edits.snapshot();
			await invalidateAll();
		} catch (error) { navigationError = String(error); }
		finally { busy = false; }
	}
	async function archive() {
		if (busy) return;
		if (menu) menu.open = false;
		busy = true; navigationError = '';
		try {
			await edits.snapshot();
			const response = await fetch(`/api/images/${page.params.img}/archive`, { method: page.data.image.isArchived ? 'DELETE' : 'POST' });
			if (!response.ok) throw new Error('Could not update photo archive status');
			await invalidateAll();
		} catch (error) { navigationError = String(error); }
		finally { busy = false; }
	}
	const tool = $derived(editorToolFromPath(page.url.pathname));
	const query = $derived(editorFilterQuery(readEditorFilters(page.url.searchParams)));
	async function navigate(id: number | undefined) {
		if (!id || busy) return;
		const destination = editorToolUrl(id, tool, query);
		busy = true;
		navigationError = '';
		try {
			const sourceId = edits.currentImageId;
			const styling = edits.hasChanges ? captureStyling() : savedStyling?.imageId === sourceId ? savedStyling : undefined;
			const offerStyling = id === page.data.nextImage;
			await edits.snapshot();
			await goto(destination);
			await tick();
			if (styling && offerStyling && edits.currentImageId === String(id)) {
				savedStyling = undefined;
				stylingToast = app.addToast('Apply previous styling?', 'info', {
					label: 'Apply',
					run: () => {
						if (busy || edits.currentImageId !== String(id)) return;
						const settings = resetEditorTool($state.snapshot(edits.pp3), styling.settings, 'adjustments', {});
						edits.reset(settings, page.data.image, styling.groups, styling.strength);
						dismissStylingToast();
					}
				});
			}
		} catch (error) {
			navigationError = String(error);
		} finally { busy = false; }
	}
	function keydown(event: KeyboardEvent) {
		if (event.key === 'Escape' && menu) menu.open = false;
		if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z' && !event.altKey) {
			if (event.defaultPrevented || showFilter || document.querySelector('dialog[open]') || (event.target as Element)?.closest('input, textarea, select, [contenteditable]')) return;
			event.preventDefault();
			if (!event.repeat) { if (event.shiftKey) redo(); else undo(); }
			return;
		}
		if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's' && !event.altKey && !event.shiftKey) {
			event.preventDefault();
			if (!event.repeat && !showFilter && !document.querySelector('dialog[open]') && !page.data.editorError && page.data.hasMatchingImages !== false) void save();
			return;
		}
		if (event.defaultPrevented || event.repeat || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || showFilter || document.querySelector('dialog[open]')) return;
		if ((event.target as Element)?.closest('input, textarea, select, button, a, summary, [contenteditable], [role="slider"]')) return;
		const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
		const actions: Record<string, () => void> = {
			z: undo, y: redo,
			s: () => { void save(); }, r: () => { void reset(); }, a: () => { void archive(); },
			ArrowLeft: () => { void navigate(page.data.previousImage); },
			ArrowRight: () => { void navigate(page.data.nextImage); }
		};
		if ((page.data.editorError || page.data.hasMatchingImages === false) && !key.startsWith('Arrow')) return;
		const action = actions[key];
		if (!action) return;
		event.preventDefault();
		action();
	}
</script>

<svelte:window onkeydown={keydown} onpointerdown={(event) => { if (menu && !menu.contains(event.target as Node)) menu.open = false; }} />
<nav aria-label="Image navigation" class="editor-footer relative shrink-0 border-t border-neutral-800 bg-neutral-950 text-neutral-300">
	<div class="editing-row hidden items-center justify-between lg:flex" role="group" aria-label="Editing actions">
		<div class="flex items-center gap-1">
			<Tooltip text="Undo · Z / Ctrl+Z" position="top"><button type="button" class="nav-action" aria-label="Undo" aria-keyshortcuts="Z Control+Z Meta+Z" disabled={editingDisabled || !edits.canUndo} onclick={undo}><IconArrowBackUp size={19} /></button></Tooltip>
			<Tooltip text="Redo · Y / Ctrl+Shift+Z" position="top"><button type="button" class="nav-action" aria-label="Redo" aria-keyshortcuts="Y Control+Shift+Z Meta+Shift+Z" disabled={editingDisabled || !edits.canRedo} onclick={redo}><IconArrowForwardUp size={19} /></button></Tooltip>
		</div>
		<div class="flex items-center gap-1">
			<PreviewLoading loading={historyActions?.loading ?? edits.isLoading} />
			<Tooltip text="Reset this tool · R" position="top"><button type="button" class="nav-action reset-action" aria-label="Reset edits" aria-keyshortcuts="R" disabled={editingDisabled} onclick={reset}><IconRestore size={18} /><span>Reset</span></button></Tooltip>
			<Tooltip text={page.data.image.isArchived ? 'Restore photo · A' : 'Archive photo · A'} position="left"><button type="button" class="nav-action" aria-label={page.data.image.isArchived ? 'Restore photo' : 'Archive photo'} aria-keyshortcuts="A" disabled={editingDisabled} onclick={archive}>{#if page.data.image.isArchived}<IconRestore size={19} />{:else}<IconArchive size={19} />{/if}</button></Tooltip>
		</div>
	</div>
	<div class="navigation-row flex items-center gap-1">
	<button type="button" class="nav-action image-step" aria-label="Previous image" disabled={busy || !page.data.previousImage} onclick={() => navigate(page.data.previousImage)}><IconChevronLeft size={20} /></button>
	<div class="image-counter hidden min-w-0 flex-1 items-center justify-center gap-2 lg:flex" aria-live="polite" aria-atomic="true">
		<span class="tabular-nums"><span class="font-semibold text-neutral-100">{page.data.currentImagePosition ?? '—'}</span><span class="mx-1.5 text-neutral-600">/</span>{page.data.matchingImageCount ?? 0}</span>
		{#if filtered}<span class="filtered-label text-neutral-500"><span aria-hidden="true">· </span>filtered</span>{/if}
	</div>
	<button type="button" class="nav-action image-step" aria-label="Next image" disabled={busy || !page.data.nextImage} onclick={() => navigate(page.data.nextImage)}><IconChevronRight size={20} /></button>
	<button type="button" class="nav-action filter-action relative lg:ml-2" aria-label={filtered ? 'Filter gallery (active)' : 'Filter gallery'} aria-pressed={filtered} title={filtered ? 'Filter gallery · filters active' : 'Filter gallery'} disabled={busy} onclick={() => showFilter = true}><IconFilter size={20} />{#if filtered}<span class="filter-badge" aria-hidden="true"></span>{/if}</button>
	<button type="button" class="relative ml-auto flex min-h-11 w-24 shrink-0 items-center justify-center gap-2 rounded-xl bg-neutral-100 px-3 text-sm font-semibold text-neutral-950 disabled:opacity-50 lg:hidden" aria-label="Save edits" disabled={busy} onclick={save}>
		{#if savedImage === edits.currentImageId && !edits.hasChanges}<IconCheck size={18} />{:else}<IconDeviceFloppy size={18} />{/if}
		{busy ? 'Saving…' : savedImage === edits.currentImageId && !edits.hasChanges ? 'Saved' : 'Save'}
		{#if edits.hasChanges}<span class="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-neutral-600" aria-label="Unsaved changes"></span>{/if}
	</button>
	<details bind:this={menu} class="relative lg:hidden">
		<summary class="nav-action list-none cursor-pointer" aria-label="More photo actions"><svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" /></svg></summary>
		<div class="absolute bottom-full right-0 z-50 mb-2 w-44 rounded-xl border border-neutral-700 bg-neutral-900 p-1 shadow-xl">
			<button type="button" class="menu-action" disabled={busy} onclick={reset}><IconRestore size={18} />Reset edits</button>
			<button type="button" class="menu-action" disabled={busy} onclick={archive}><IconArchive size={18} />{page.data.image.isArchived ? 'Restore photo' : 'Archive photo'}</button>
		</div>
	</details>
	</div>
	{#if navigationError}<p role="alert" class="absolute bottom-full left-3 right-3 mb-2 rounded-xl border border-neutral-700 bg-neutral-950 p-3 text-sm text-red-300">{navigationError}</p>{/if}
</nav>
{#if showFilter}<FilterModal onClose={() => showFilter = false} />{/if}

<style>
	.editor-footer { padding: 4px 12px calc(4px + env(safe-area-inset-bottom)); }
	.image-counter { font-size: 13px; line-height: 1; white-space: nowrap; }
	.filtered-label { font-size: 11px; }
	.reset-action { gap: 7px; padding: 0 12px; font-size: 12px; font-weight: 500; }
	.filter-badge { position: absolute; top: 9px; right: 9px; height: 5px; width: 5px; border-radius: 50%; background: var(--color-accent); box-shadow: 0 0 0 2px #0a0a0a; }
	.filter-action[aria-pressed="true"] { color: var(--color-accent-soft); }
	@media (min-width: 1024px) {
		.editor-footer { height: 112px; padding: 8px 12px; }
		.editing-row { height: 44px; }
		.navigation-row { height: 44px; margin-top: 6px; }
	}
	.nav-action { display: flex; min-height: 44px; min-width: 44px; align-items: center; justify-content: center; border-radius: 9999px; }
	.nav-action { transition: background-color 120ms, color 120ms; }
	.nav-action:hover:not(:disabled) { background: #262626; color: #f5f5f5; }
	.nav-action:disabled { opacity: .25; }
	.nav-action:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
	.image-step { color: var(--color-accent); background: #fb923c14; }
	.image-step:hover:not(:disabled) { color: var(--color-accent-soft); background: #fb923c2e; }
	.image-step:focus-visible { outline-color: var(--color-accent); }
	.image-step:disabled { color: #737373; background: transparent; opacity: .5; }
	.menu-action { display: flex; min-height: 44px; width: 100%; align-items: center; gap: 12px; border-radius: 8px; padding: 0 12px; font-size: 14px; }
	.menu-action:hover { background: #262626; }
</style>
