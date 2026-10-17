<script lang="ts">
	import { beforeNavigate, goto, invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import { edits } from '$lib/state/editing.svelte';
	import { editorFilterQuery, filterSummary, isFiltered, passProgress, readEditorFilters } from '$lib/editor-filters';
	import { IconChevronLeft, IconChevronRight, IconFilter, IconRestore, IconArchive, IconArrowBackUp, IconArrowForwardUp } from './icons';
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
	import EditorPhotoBrowser from './EditorPhotoBrowser.svelte';
	import IconPhoto from '@tabler/icons-svelte/icons/photo';
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
	let menu = $state<HTMLDetailsElement>();
	let showBrowser = $state(false);
	let returnToBrowser = $state(false);
	let browserButton = $state<HTMLButtonElement>();
	let browserRoot = $state<HTMLDivElement>();
	function closeBrowser() { showBrowser = false; browserButton?.focus(); }
	const historyActions = getContext<EditorHistoryActions | undefined>(editorHistoryKey);
	const activeFilters = $derived(readEditorFilters(page.url.searchParams));
	const filtered = $derived(isFiltered(activeFilters));
	const summary = $derived(filterSummary(activeFilters));
	const progress = $derived(activeFilters.show === 'todo'
		? passProgress((page.data.navigationImages ?? []).map((image: { id: number }) => image.id), page.data.finishedImageIds ?? [], Number(page.params.img), edits.hasSavedVersion)
		: undefined);
	const progressLabel = $derived(progress ? (progress.remaining ? `${progress.remaining} of ${page.data.navigationImages.length} left` : 'All edited') : '');
	const done = $derived(progress && page.data.navigationImages.length ? progress.finished.size / page.data.navigationImages.length : 0);
	const editingDisabled = $derived(busy || !!page.data.editorError || page.data.hasMatchingImages === false);
	/** Autosave owns the writes; the footer only reports where they stand. */
	const saveState = $derived(edits.isFaulty ? 'Save failed' : edits.isSaving ? 'Saving…' : edits.hasChanges ? 'Unsaved' : 'Saved');
	function undo() { if (!editingDisabled && edits.canUndo) (historyActions?.undo ?? (() => edits.undo()))(); }
	function redo() { if (!editingDisabled && edits.canRedo) (historyActions?.redo ?? (() => edits.redo()))(); }
	beforeNavigate(() => { if (menu) menu.open = false; dismissStylingToast(); });
	async function save() {
		if (busy) return;
		busy = true; navigationError = '';
		try {
			const styling = edits.hasChanges ? captureStyling() : undefined;
			await edits.snapshot({ force: true });
			if (styling) savedStyling = styling;
			await invalidateAll();
		}
		catch (error) { navigationError = String(error); }
		finally { busy = false; }
	}
	async function reset() {
		if (busy) return;
		if (menu) menu.open = false;
		busy = true; navigationError = '';
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
	const query = $derived(editorFilterQuery(activeFilters));
	async function navigate(id: number | undefined) {
		if (!id || busy || id === Number(page.params.img)) return;
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
		if (event.key === 'Escape' && showBrowser) { event.preventDefault(); closeBrowser(); return; }
		if (showBrowser) return;
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
			s: () => { void save(); }, r: () => { void reset(); }, a: () => { void archive(); },			ArrowLeft: () => { void navigate(page.data.previousImage); },
			ArrowRight: () => { void navigate(page.data.nextImage); }
		};
		if ((page.data.editorError || page.data.hasMatchingImages === false) && !key.startsWith('Arrow')) return;
		const action = actions[key];
		if (!action) return;
		event.preventDefault();
		action();
	}
</script>

<svelte:window onkeydown={keydown} onpointerdown={(event) => { if (menu && !menu.contains(event.target as Node)) menu.open = false; if (showBrowser && !browserRoot?.contains(event.target as Node) && !browserButton?.contains(event.target as Node)) showBrowser = false; }} />
<nav aria-label="Image navigation" class="editor-footer relative shrink-0 border-t border-neutral-800 bg-neutral-950 text-neutral-300">
	{#if showBrowser}<div bind:this={browserRoot}><EditorPhotoBrowser bind:busy onnavigate={navigate} onclose={closeBrowser} onfilter={() => { returnToBrowser = true; showBrowser = false; showFilter = true; }} /></div>{/if}
	<div class="editing-row hidden items-center justify-between lg:flex" role="group" aria-label="Editing actions" inert={showBrowser}>
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
	<div class="navigation-row flex items-center gap-1" inert={showBrowser}>
	<button type="button" class="nav-action image-step" aria-label="Previous image" disabled={busy || !page.data.previousImage} onclick={() => navigate(page.data.previousImage)}><IconChevronLeft size={20} /></button>
	<button bind:this={browserButton} type="button" class="image-counter min-w-0 flex-1 items-center justify-center gap-2 flex" aria-label={['Browse session photos', summary, progressLabel].filter(Boolean).join(', ')} aria-expanded={showBrowser} aria-controls="editor-photo-browser" title={[summary, progressLabel].filter(Boolean).join(' · ') || 'Browse session photos'} onclick={() => showBrowser = !showBrowser}>
		<IconPhoto size={16} class="shrink-0" />
		<span class="tabular-nums text-neutral-300">{page.data.currentImagePosition ?? '–'} of {page.data.matchingImageCount ?? 0}</span>
		{#if summary}<span class="filtered-label min-w-0 truncate text-neutral-500"><span aria-hidden="true">{'· '}</span>{summary}</span>{/if}
		{#if progress}<i class="progress" aria-hidden="true"><i style:width={`${done * 100}%`}></i></i>{/if}
	</button>
	<button type="button" class="nav-action image-step" aria-label="Next image" disabled={busy || !page.data.nextImage} onclick={() => navigate(page.data.nextImage)}><IconChevronRight size={20} /></button>
	<button type="button" class="nav-action filter-action relative lg:ml-2" aria-label={filtered ? `Filter photos (${summary})` : 'Filter photos'} aria-pressed={filtered} title={filtered ? `Filter photos · ${summary}` : 'Filter photos'} disabled={busy} onclick={() => showFilter = true}><IconFilter size={20} />{#if filtered}<span class="filter-badge" aria-hidden="true"></span>{/if}</button>
	<span class="save-state ml-auto shrink-0 lg:ml-0" role="status">{saveState}</span>
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
{#if showFilter}<FilterModal onClose={() => { showFilter = false; if (returnToBrowser) { showBrowser = true; returnToBrowser = false; } }} />{/if}

<style>
	.editor-footer { padding: 4px 12px calc(4px + env(safe-area-inset-bottom)); }
	.image-counter { font-size: 12px; line-height: 1; white-space: nowrap; color: #a3a3a3; }
	.image-counter { position: relative; min-height: 44px; border-radius: 8px; cursor: pointer; }
	/* A hairline that fills as photos in a To edit list are finished. */
	.progress { position: absolute; left: 12px; right: 12px; bottom: 5px; height: 2px; border-radius: 1px; background: #333; overflow: hidden; }
	.progress > i { display: block; height: 100%; background: #d4d4d4; transition: width 300ms ease-out; }
	.image-counter:hover, .image-counter[aria-expanded='true'] { background: #262626; color: white; }
	.image-counter:focus-visible { outline: 2px solid white; outline-offset: -2px; }
	@media (max-width: 1023px) { .image-counter { flex: none; min-width: 44px; } .image-counter > span { display: none; } }
	.editor-footer { z-index: 45; }
	.filtered-label { max-width: 9rem; }
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
	.image-step { color: #e5e5e5; background: #262626; }
	.image-step:hover:not(:disabled) { color: #fff; background: #404040; }
	.image-step:focus-visible { outline-color: #fff; }
	.image-step:disabled { color: #737373; background: transparent; opacity: .5; }
	.menu-action { display: flex; min-height: 44px; width: 100%; align-items: center; gap: 12px; border-radius: 8px; padding: 0 12px; font-size: 14px; }
	.menu-action:hover { background: #262626; }
	.save-state { display: inline-flex; min-height: 44px; align-items: center; font-size: 12px; font-weight: 500; white-space: nowrap; color: #737373; }
	@media (min-width: 1024px) { .save-state { min-height: 0; } }
</style>
