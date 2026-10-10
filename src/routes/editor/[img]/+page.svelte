<script lang="ts">
	import { editorFilterQuery, readEditorFilters, hasEditorFilters } from '$lib/editor-filters';
	import { beforeNavigate, goto, invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import { getWorkerInstance } from '$lib';
	import BasePP3 from '$lib/assets/client.pp3?raw';
	import { filterPP3, toBase64 } from '$lib/pp3-utils';
	import { edits } from '$lib/state/editing.svelte';
	import { tagStore } from '$lib/state/tag.svelte';
	import BeforeAfter from '$lib/ui/BeforeAfter.svelte';
	import Button from '$lib/ui/Button.svelte';
	import EditModeNav from '$lib/ui/EditModeNav.svelte';
	import Tooltip from '$lib/ui/Tooltip.svelte';
	import LutPicker from '$lib/ui/LutPicker.svelte';
	import {
		IconArchive,
		IconArrowBackUp,
		IconArrowForwardUp,
		IconCheck,
		IconChevronLeft,
		IconChevronRight,
		IconDeviceFloppy,
		IconFidgetSpinner,
		IconRestore,
		IconFilter
	} from '$lib/ui/icons';
	import { fade } from 'svelte/transition';
	import { onDestroy, untrack } from 'svelte';
	import Adjustments from './Adjustments.svelte';
	import Snapshots from './Snapshots.svelte';
	import FilterModal from '$lib/ui/FilterModal.svelte';

	let { data } = $props();
	const navigationQuery = $derived(editorFilterQuery(readEditorFilters(page.url.searchParams)));
	let showLutPicker = $state(false);
	let showFilterModal = $state(false);
	let mobileActions: HTMLDetailsElement | undefined;

	let sampleImage = $state('');
	let sampleImageId = $state<string | null>(null);
	onDestroy(() => {
		if (sampleImage.startsWith('blob:')) URL.revokeObjectURL(sampleImage);
	});
	let apiPath = $derived(`/api/images/${data.image.id}`);
	let snapshotSaved = $state(false);
	let resetSaved = $state(false);
	let actionVersion = 0;
	let confirmationVersion = 0;
	let resetting = false;
	onDestroy(() => {
		actionVersion += 1;
	});
	let beforeImage = $derived(apiPath + `/edit?preview&config=${toBase64(filterPP3(edits.throttledPP3, ['Crop', 'Rotation']))}`);
	let savedImage = $derived(apiPath + `/edit?preview&config=${toBase64(edits.lastSavedDocument || data.snapshots[0]?.pp3 || data.image.importBaseline || BasePP3)}`);
	let flashKey = $state<string | null>(null);
	let flashTimer: number | null = null;

	// TODO: Configure autosave behavior in settings
	beforeNavigate(() => {
		actionVersion += 1;
		confirmationVersion += 1;
		snapshotSaved = false;
		resetSaved = false;
		if (edits.hasChanges) {
			edits.snapshot();
		}
	});

	async function archiveImage() {
		const res = await fetch(`/api/images/${page.params.img}/archive`, {
			method: 'POST'
		});
		if (res.ok) {
			await invalidateAll();
		} else {
			// Handle error (optional)
			alert('Failed to archive image.');
		}
	}

	async function restoreImage() {
		const res = await fetch(`/api/images/${page.params.img}/archive`, {
			method: 'DELETE'
		});
		if (res.ok) {
			await invalidateAll();
		} else {
			// Handle error (optional)
			alert('Failed to restore image.');
		}
	}

	async function snapshot() {
		const imageId = edits.currentImageId;
		const version = actionVersion;
		await edits.snapshot();
		if (version !== actionVersion || imageId !== edits.currentImageId) return;

		snapshotSaved = true;
		resetSaved = false;
		const confirmation = ++confirmationVersion;
		await invalidateAll();

		setTimeout(() => {
			if (version !== actionVersion || confirmation !== confirmationVersion) return;
			snapshotSaved = false;
		}, 2000);
	}

	$effect(() => {
		if (!data.hasMatchingImages || data.editorError) return;
		const latestSnapshot = data.snapshots[0];
		const image = data.image;
		const pp3 = latestSnapshot?.pp3 ?? image.importBaseline ?? BasePP3;
		untrack(() => edits.initialize(pp3, image));
	});

	$effect(() => {
		if (!data.hasMatchingImages || data.editorError) {
			edits.isLoading = false;
			return;
		}
		const worker = getWorkerInstance();
		let active = true;
		edits.isLoading = true;
		const imageId = page.params.img!;
		const config = toBase64(edits.throttledPP3);
		let timeout: ReturnType<typeof setTimeout>;
		let timedOut = false;
		const render = worker.refreshImage(imageId, config).then((result) => {
			if (timedOut && result?.url.startsWith('blob:')) URL.revokeObjectURL(result.url);
			return result;
		});
		const fallback = new Promise<{ url: string; error: boolean }>((resolve) => {
			timeout = setTimeout(() => {
				timedOut = true;
				resolve({ url: `/api/images/${imageId}/edit?config=${encodeURIComponent(config)}`, error: false });
			}, 15000);
		});
		Promise.race([render, fallback])
			.finally(() => clearTimeout(timeout))
			.then((result) => {
				if (!active) {
					if (result?.url.startsWith('blob:')) URL.revokeObjectURL(result.url);
					return;
				}
				if (result) {
					if (sampleImage.startsWith('blob:')) URL.revokeObjectURL(sampleImage);
					sampleImage = result.url;
					sampleImageId = imageId;
					edits.isFaulty = result.error;
					edits.isLoading = false;
				}
			})
			.catch((error) => {
				if (!active) return;
				console.error('Error refreshing image:', error);
				edits.isFaulty = true;
				edits.isLoading = false;
			});
		return () => {
			active = false;
		};
	});

	$effect(() => {
		tagStore.existingTags = data.tags.map((t) => t.name);
		tagStore.selected = data.imageTags.map((it) => it.name);
	});

	const keyMap = $derived(
		new Map<string, () => void>([
			['s', snapshot],
			['ArrowRight', () => (data.nextImage ? goto(`/editor/${data.nextImage}${navigationQuery}`) : undefined)],
			['ArrowLeft', () => (data.previousImage ? goto(`/editor/${data.previousImage}${navigationQuery}`) : undefined)],
			['a', () => (data.image.isArchived ? restoreImage() : archiveImage())],
			['p', () => showPreview()],
			['r', () => reset()],
			['z', () => edits.undo()],
			['y', () => edits.redo()]
		])
	);

	function handleKeyDown(event: KeyboardEvent) {
		if (!data.hasMatchingImages) return;
		const target = event.target as HTMLElement | null;
		if (event.repeat) {
			return;
		}
		if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)) {
			return; // Ignore key events when focused on input fields
		}
		const normalizedKey = event.key.length === 1 ? event.key.toLowerCase() : event.key;
		if (data.editorError && normalizedKey !== 'ArrowLeft' && normalizedKey !== 'ArrowRight') return;
		const action = keyMap.get(normalizedKey);
		if (action) {
			event.preventDefault();
			if (normalizedKey === 'a' || normalizedKey === 's' || normalizedKey === 'ArrowLeft' || normalizedKey === 'ArrowRight') {
				flashKey = normalizedKey;
				if (flashTimer) {
					clearTimeout(flashTimer);
				}
				flashTimer = window.setTimeout(() => {
					if (flashKey === normalizedKey) {
						flashKey = null;
					}
				}, 220);
			}
			action();
		}
	}

	function showPreview() {
		const url = new URL(apiPath + `/render`, location.origin);
		window.open(url, '_blank');
	}

	async function reset() {
		if (resetting) return;
		resetting = true;
		const imageId = edits.currentImageId;
		const version = actionVersion;
		try {
			if (edits.hasChanges) {
				await snapshot();
			}
			if (version !== actionVersion || imageId !== edits.currentImageId) return;

			edits.reset(data.image.importBaseline ?? BasePP3, data.image);
			await edits.snapshot();
			if (version !== actionVersion || imageId !== edits.currentImageId) return;

			resetSaved = true;
			snapshotSaved = false;
			const confirmation = ++confirmationVersion;
			await invalidateAll();

			setTimeout(() => {
				if (version !== actionVersion || confirmation !== confirmationVersion) return;
				resetSaved = false;
			}, 2000);
		} finally {
			resetting = false;
		}
	}
</script>

<svelte:window
	onkeydown={(event) => {
		if (event.key === 'Escape' && mobileActions) mobileActions.open = false;
		handleKeyDown(event);
	}}
	onpointerdown={(event) => {
		if (mobileActions && !mobileActions.contains(event.target as Node)) mobileActions.open = false;
	}}
/>

{#if !data.hasMatchingImages}
	<div class="flex h-full items-center justify-center overflow-y-auto bg-neutral-950 px-6 py-12 text-center text-neutral-200">
		<div class="flex max-w-sm flex-col items-center gap-5">
			<div class="rounded-full border border-neutral-700 bg-neutral-900 p-5 text-neutral-400"><IconFilter size={32} /></div>
			<h1 class="text-2xl font-bold">No photos match this filter</h1>
			<div class="flex flex-wrap justify-center gap-3">
				<button class="min-h-12 rounded-xl border border-neutral-600 px-5 font-semibold hover:bg-neutral-800" onclick={() => (showFilterModal = true)}>Change filter</button>
				<a href={`/editor/${data.image.id}?filter=none`} class="flex min-h-12 items-center rounded-xl bg-neutral-100 px-5 font-semibold text-neutral-950 hover:bg-white">Show all photos</a>
			</div>
		</div>
	</div>
{:else if data.editorError}
	<div class="flex h-full items-center justify-center overflow-y-auto bg-neutral-950 px-6 py-12 text-center text-neutral-200">
		<div class="flex max-w-md flex-col items-center gap-5" role="alert">
			<div class="rounded-full border border-neutral-700 bg-neutral-900 p-5 text-neutral-300">
				<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 3 2 21h20Z" /><path d="M12 9v5m0 3v1" /></svg>
			</div>
			<h1 class="text-2xl font-bold">Photo not ready for editing</h1>
			<p class="text-sm font-semibold text-neutral-300">{data.image.name}</p>
			<p class="text-neutral-400">{data.editorError}</p>
			<div class="flex flex-wrap justify-center gap-3">
				<a href="/gallery" class="flex min-h-12 items-center rounded-xl bg-neutral-100 px-5 font-semibold text-neutral-950">Open Gallery</a>
				<button type="button" class="min-h-12 rounded-xl border border-neutral-600 px-5 font-semibold hover:bg-neutral-800" onclick={() => invalidateAll()}>Check again</button>
			</div>
			<div class="flex gap-3">
				{#if data.previousImage}<a href={`/editor/${data.previousImage}${navigationQuery}`} class="flex min-h-11 items-center gap-2 rounded-lg px-3 hover:bg-neutral-800"><IconChevronLeft size={20} />Previous</a>{/if}
				{#if data.nextImage}<a href={`/editor/${data.nextImage}${navigationQuery}`} class="flex min-h-11 items-center gap-2 rounded-lg px-3 hover:bg-neutral-800">Next<IconChevronRight size={20} /></a>{/if}
			</div>
		</div>
	</div>
{:else}
<div class="flex h-full flex-col overflow-hidden bg-neutral-950 text-neutral-200 lg:flex-row">
	<!-- Image Preview Section -->
	<div class="relative min-h-0 flex-1 overflow-hidden bg-neutral-900 shadow-inner">
		<div class="flex h-full items-center justify-center p-2 sm:p-2">
			<BeforeAfter {beforeImage} {savedImage} isLoading={edits.isLoading} imageId={data.image.id} afterImage={sampleImageId === String(data.image.id) ? sampleImage : ''} />
		</div>

		<!-- Desktop Left Nav -->
		<div class="absolute inset-y-0 left-4 hidden z-30 lg:flex flex-col justify-center pointer-events-none">
			<div class="pointer-events-auto">
				<EditModeNav img={page.params.img!} showCrop showSnapshots showClipboard showFlag showLast />
			</div>
		</div>

		<!-- Mobile Bottom Nav -->
		<div class="absolute bottom-4 left-0 right-0 z-40 flex justify-center lg:hidden pointer-events-none">
			<div class="pointer-events-auto">
				<EditModeNav img={page.params.img!} showHistory showCrop showSnapshots showClipboard showFlag showLast />
			</div>
		</div>
	</div>

	<!-- Controls Panel Section -->
	<aside class="flex w-full flex-col border-t border-neutral-800 bg-neutral-950 transition-all duration-300 lg:h-full lg:w-[380px] lg:border-t-0 lg:border-l h-[45vh] lg:h-auto">
		<!-- Panel Header -->
		<div class="hidden lg:flex items-center justify-between border-b border-neutral-800 px-6 py-3 lg:py-4">
			<div class="flex items-center gap-3">
				<div class="h-2 w-2 rounded-full bg-neutral-500"></div>
				<h2 class="text-xs font-bold tracking-widest uppercase text-neutral-400">Adjustments</h2>
			</div>
			<div class="flex items-center gap-1">
				{#if edits.isLoading}
					<div in:fade={{ duration: 200, delay: 200 }} class="mr-2">
						<IconFidgetSpinner class="animate-spin text-neutral-500" size={16} />
					</div>
				{/if}
				<button
					onclick={() => edits.undo()}
					disabled={!edits.canUndo}
					class="flex h-7 w-7 items-center justify-center rounded-md text-neutral-500 transition-colors hover:bg-neutral-800 hover:text-neutral-200 disabled:opacity-25 disabled:pointer-events-none"
					aria-label="Undo"
				>
					<IconArrowBackUp size={16} />
				</button>
				<button
					onclick={() => edits.redo()}
					disabled={!edits.canRedo}
					class="flex h-7 w-7 items-center justify-center rounded-md text-neutral-500 transition-colors hover:bg-neutral-800 hover:text-neutral-200 disabled:opacity-25 disabled:pointer-events-none"
					aria-label="Redo"
				>
					<IconArrowForwardUp size={16} />
				</button>
			</div>
		</div>

		<!-- Scrollable Controls -->
		<div data-adjustment-scroll class="min-h-0 flex-1 overflow-y-auto px-3 py-2 lg:px-6 lg:py-4 custom-scrollbar">
			{#if edits.pp3}
				<Adjustments {data} bind:showLutPicker previewSrc={sampleImageId === String(data.image.id) && !edits.isFaulty ? sampleImage : ''} />
			{/if}
		</div>

		<!-- Actions Footer -->
		<div
			class="flex shrink-0 items-center gap-1 border-t border-neutral-800 bg-neutral-900 px-3 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] lg:hidden"
			aria-label="Photo actions"
		>
			{#if data.previousImage}
				<a href={`/editor/${data.previousImage}${navigationQuery}`} aria-label="Previous image" class="mobile-action"><IconChevronLeft size={20} /></a>
			{:else}
				<button disabled aria-label="Previous image" class="mobile-action"><IconChevronLeft size={20} /></button>
			{/if}
			{#if data.nextImage}
				<a href={`/editor/${data.nextImage}${navigationQuery}`} aria-label="Next image" class="mobile-action"><IconChevronRight size={20} /></a>
			{:else}
				<button disabled aria-label="Next image" class="mobile-action"><IconChevronRight size={20} /></button>
			{/if}
			<button onclick={() => (showFilterModal = true)} aria-label="Filter gallery" class="mobile-action"><IconFilter size={20} /></button>
			<button
				onclick={snapshot}
				class="relative ml-auto flex min-h-11 w-24 shrink-0 items-center justify-center gap-2 rounded-xl bg-neutral-100 px-3 text-sm font-semibold text-neutral-950"
				aria-label="Save edits"
			>
				{#if snapshotSaved}<IconCheck size={18} />{:else}<IconDeviceFloppy size={18} />{/if}
				{snapshotSaved ? 'Saved' : 'Save'}
				{#if edits.hasChanges}<span class="absolute top-2 right-2 h-1.5 w-1.5 rounded-full bg-neutral-600" aria-label="Unsaved changes"></span>{/if}
			</button>
			<details bind:this={mobileActions} class="relative">
				<summary class="mobile-action list-none cursor-pointer" aria-label="More photo actions"
					><svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"
						><circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" /></svg
					></summary
				>
				<div class="absolute bottom-full right-0 z-50 mb-2 w-44 rounded-xl border border-neutral-700 bg-neutral-900 p-1 shadow-xl">
					<button
						class="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-sm hover:bg-neutral-800"
						onclick={() => {
							mobileActions!.open = false;
							reset();
						}}><IconRestore size={18} />Reset edits</button
					>
					<button
						class="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-sm hover:bg-neutral-800"
						onclick={() => {
							mobileActions!.open = false;
							if (data.image.isArchived) restoreImage();
							else archiveImage();
						}}><IconArchive size={18} />{data.image.isArchived ? 'Restore photo' : 'Archive photo'}</button
					>
				</div>
			</details>
		</div>
		<div class="hidden lg:block border-t border-neutral-800 bg-neutral-900/50 p-4 lg:p-6 backdrop-blur-sm">
			<div class="grid grid-cols-2 gap-2 lg:gap-3">
				<Button onclick={reset} flash={flashKey === 'r'} class="justify-center py-2 lg:py-2.5">
					<span class="text-xs lg:text-sm">Reset</span>
					{#if resetSaved}
						<IconCheck size={16} />
					{:else}
						<IconRestore size={16} />
					{/if}
				</Button>

				<Button onclick={snapshot} flash={flashKey === 's'} class="relative justify-center bg-neutral-100 hover:bg-neutral-200 border-none py-2 lg:py-2.5">
					<span class="text-xs lg:text-sm">Save Edits</span>
					{#if snapshotSaved}
						<IconCheck size={16} />
					{:else}
						<IconDeviceFloppy size={16} />
					{/if}
					{#if edits.hasChanges}
						<span class="absolute top-2 right-2 block h-1.5 w-1.5 rounded-full bg-neutral-800" aria-label="Unsaved changes"></span>
					{/if}
				</Button>
			</div>

			<!-- Navigation Controls -->
			<div class="mt-4 flex items-center justify-between border-t border-neutral-800 pt-3 lg:mt-6 lg:pt-4">
				<div class="flex items-center gap-4">
					{#if data.previousImage}
						<Tooltip text="Previous Image" position="top">
							<a
								href={`/editor/${data.previousImage}${navigationQuery}`}
								class="flex h-9 w-9 items-center justify-center rounded-full transition-all hover:bg-neutral-800 hover:text-neutral-50"
								class:nav-flash={flashKey === 'ArrowLeft'}
							>
								<IconChevronLeft size={20} />
							</a>
						</Tooltip>
					{:else}
						<div class="flex h-9 w-9 items-center justify-center text-neutral-800">
							<IconChevronLeft size={20} />
						</div>
					{/if}

					<div class="text-[10px] font-bold text-neutral-600 uppercase tracking-[0.2em]">Nav</div>

					{#if data.nextImage}
						<Tooltip text="Next Image" position="top">
							<a
								href={`/editor/${data.nextImage}${navigationQuery}`}
								class="flex h-9 w-9 items-center justify-center rounded-full transition-all hover:bg-neutral-800 hover:text-neutral-50"
								class:nav-flash={flashKey === 'ArrowRight'}
							>
								<IconChevronRight size={20} />
							</a>
						</Tooltip>
					{:else}
						<div class="flex h-9 w-9 items-center justify-center text-neutral-800">
							<IconChevronRight size={20} />
						</div>
					{/if}

					<div class="mx-2 h-4 w-px bg-neutral-800"></div>

					<Tooltip text="Filter Gallery" position="top">
						{@const hasFilter = hasEditorFilters(page.url.searchParams)}
						<button
							onclick={() => (showFilterModal = true)}
							class="flex h-9 w-9 items-center justify-center rounded-full transition-all hover:bg-neutral-800"
							class:text-neutral-50={hasFilter}
							class:bg-neutral-800={hasFilter}
							aria-label="Filter Gallery"
						>
							<IconFilter size={20} />
						</button>
					</Tooltip>
				</div>

				{#if !data.image.isArchived}
					<button onclick={archiveImage} class="flex h-9 items-center gap-2 px-3 text-xs font-bold uppercase tracking-widest text-neutral-500 hover:text-neutral-300">
						<IconArchive size={16} />
						<span>Archive</span>
					</button>
				{:else}
					<button onclick={restoreImage} class="flex h-9 items-center gap-2 px-3 text-xs font-bold uppercase tracking-widest text-neutral-200">
						<IconRestore size={16} />
						<span>Restore</span>
					</button>
				{/if}
			</div>
		</div>
	</aside>
</div>

{/if}

{#if showLutPicker && data.hasMatchingImages && !data.editorError}
	<LutPicker luts={data.luts} onClose={() => (showLutPicker = false)} imageId={page.params.img!} />
{/if}

{#if showFilterModal}
	<FilterModal onClose={() => (showFilterModal = false)} />
{/if}

{#if page.url.searchParams.has('snapshot') && data.hasMatchingImages && !data.editorError}
	<Snapshots snapshots={data.snapshots} profiles={data.profiles} />
{/if}

<style>
	.mobile-action {
		display: flex;
		align-items: center;
		justify-content: center;
		min-width: 44px;
		min-height: 44px;
		border-radius: 12px;
	}
	.mobile-action:hover {
		background: #262626;
	}
	.mobile-action:disabled {
		opacity: 0.25;
	}
	summary::-webkit-details-marker {
		display: none;
	}
	@media (max-width: 1023px) {
		.custom-scrollbar :global([data-adjustment-sections] summary) {
			min-height: 44px;
			padding-left: 12px;
		}
		.custom-scrollbar :global([data-adjustment-sections] details > div) {
			padding: 6px 8px;
			gap: 6px;
		}
	}
	.custom-scrollbar::-webkit-scrollbar {
		width: 4px;
	}
	.custom-scrollbar::-webkit-scrollbar-track {
		background: transparent;
	}
	.custom-scrollbar::-webkit-scrollbar-thumb {
		background: #262626;
		border-radius: 10px;
	}
	.custom-scrollbar::-webkit-scrollbar-thumb:hover {
		background: #404040;
	}

	.nav-flash {
		animation: navFlash 180ms ease-out;
		background-color: rgba(255, 255, 255, 0.1);
		transform: scale(1.1);
	}

	@keyframes navFlash {
		0% {
			transform: scale(1);
		}
		50% {
			transform: scale(1.2);
			background-color: rgba(255, 255, 255, 0.2);
		}
		100% {
			transform: scale(1);
		}
	}
</style>
