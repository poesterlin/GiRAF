<script lang="ts">
	import { beforeNavigate, goto, invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import { getWorkerInstance } from '$lib';
	import BasePP3 from '$lib/assets/client.pp3?raw';
	import { filterPP3, parsePP3, toBase64 } from '$lib/pp3-utils';
	import { edits } from '$lib/state/editing.svelte';
	import { tagStore } from '$lib/state/tag.svelte';
	import BeforeAfter from '$lib/ui/BeforeAfter.svelte';
	import Button from '$lib/ui/Button.svelte';
	import EditModeNav from '$lib/ui/EditModeNav.svelte';
	import Tooltip from '$lib/ui/Tooltip.svelte';
	import LutPicker from '$lib/ui/LutPicker.svelte';
	import { IconArchive, IconArrowBackUp, IconArrowForwardUp, IconCheck, IconChevronLeft, IconChevronRight, IconDeviceFloppy, IconFidgetSpinner, IconRestore, IconFilter } from '$lib/ui/icons';
	import { fade } from 'svelte/transition';
	import Adjustments from './Adjustments.svelte';
	import Snapshots from './Snapshots.svelte';
	import FilterModal from '$lib/ui/FilterModal.svelte';

	let { data } = $props();
	let showLutPicker = $state(false);
	let showFilterModal = $state(false);

	let sampleImage = $state('');
	let apiPath = $derived(`/api/images/${data.image.id}`);
	let snapshotSaved = $state(false);
	let resetSaved = $state(false);
	let beforeImage = $derived(apiPath + `/edit?preview&config=${toBase64(filterPP3(edits.throttledPP3, ['Crop', 'Rotation']))}`);
	let flashKey = $state<string | null>(null);
	let flashTimer: number | null = null;

	// TODO: Configure autosave behavior in settings
	beforeNavigate(() => {
		if(edits.hasChanges) {
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
		await edits.snapshot();

		snapshotSaved = true;
		await invalidateAll();

		setTimeout(() => {
			snapshotSaved = false;
		}, 2000);
	}

	$effect(() => {
		const latestSnapshot = data.snapshots[0];
		if (latestSnapshot) {
			edits.initialize(latestSnapshot.pp3, data.image);
		} else {
			edits.initialize(parsePP3(BasePP3), data.image);
		}
	});

	$effect(() => {
		const worker = getWorkerInstance();
		edits.isLoading = true;
		worker
			.refreshImage(page.params.img!, toBase64(edits.throttledPP3))
			.then((result) => {
				if (result) {
					sampleImage = result.url;
					edits.isFaulty = result.error;
					edits.isLoading = false;
				}
			})
			.catch((error) => {
				console.error('Error refreshing image:', error);
				edits.isFaulty = true;
				edits.isLoading = false;
			});
	});

	$effect(() => {
		tagStore.existingTags = data.tags.map((t) => t.name);
		tagStore.selected = data.imageTags.map((it) => it.name);
	});

	const keyMap = $derived(new Map<string, () => void>([
		['s', snapshot],
		['ArrowRight', () => (data.nextImage ? (goto(`/editor/${data.nextImage}?filter=${page.url.searchParams.get('filter')}`)) : undefined)],
		['ArrowLeft', () => (data.previousImage ? (goto(`/editor/${data.previousImage}?filter=${page.url.searchParams.get('filter')}`)) : undefined)],
		['a', () => (data.image.isArchived ? restoreImage() : archiveImage())],
		['p', () => showPreview()],
		['r', ()=>reset()],
		['z', () => edits.undo()],
		['y', () => edits.redo()]
	]));

	function handleKeyDown(event: KeyboardEvent) {
		const target = event.target as HTMLElement | null;
		if (event.repeat) {
			return;
		}
		if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)) {
			return; // Ignore key events when focused on input fields
		}
		const normalizedKey = event.key.length === 1 ? event.key.toLowerCase() : event.key;
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

	function showPreview(){
		const url = new URL(apiPath + `/render`, location.origin);
		window.open(url, '_blank');
	}

	async function reset(){
		if (edits.hasChanges) {
			await snapshot();
		}

		edits.pp3 = parsePP3(BasePP3);
		edits.pushHistory();
		await edits.snapshot();

		resetSaved = true;
		await invalidateAll();

		setTimeout(() => {
			resetSaved = false;
		}, 2000);
	}
</script>

<svelte:window onkeydown={handleKeyDown} />

<div class="flex h-full flex-col overflow-hidden bg-neutral-950 text-neutral-200 lg:flex-row">
	<!-- Image Preview Section -->
	<div class="relative flex-1 overflow-hidden bg-neutral-900 shadow-inner">
		<div class="flex h-full items-center justify-center p-2 sm:p-2">
			<BeforeAfter {beforeImage} afterImage={sampleImage} />
		</div>
		
		<!-- Desktop Left Nav -->
		<div class="absolute inset-y-0 left-4 hidden z-30 lg:flex flex-col justify-center pointer-events-none">
			<div class="pointer-events-auto">
				<EditModeNav
					img={page.params.img!}
					showCrop
					showSnapshots
					showClipboard
					showFlag
					showLast
				/>
			</div>
		</div>

		<!-- Mobile Bottom Nav -->
		<div class="absolute bottom-4 left-0 right-0 z-40 flex justify-center lg:hidden pointer-events-none">
			<div class="pointer-events-auto">
				<EditModeNav
					img={page.params.img!}
					showCrop
					showSnapshots
					showClipboard
					showFlag
					showLast
				/>
			</div>
		</div>
	</div>

	<!-- Controls Panel Section -->
	<aside
		class="flex w-full flex-col border-t border-neutral-800 bg-neutral-950 transition-all duration-300 lg:h-full lg:w-[380px] lg:border-t-0 lg:border-l h-[45vh] lg:h-auto"
	>
		<!-- Panel Header -->
		<div class="flex items-center justify-between border-b border-neutral-800 px-6 py-3 lg:py-4">
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
		<div class="flex-1 overflow-y-auto px-4 py-4 lg:px-6 custom-scrollbar">
			{#if edits.pp3}
				<Adjustments {data} bind:showLutPicker />
			{/if}
		</div>

		<!-- Actions Footer -->
		<div class="border-t border-neutral-800 bg-neutral-900/50 p-4 lg:p-6 backdrop-blur-sm">
			<div class="grid grid-cols-2 gap-2 lg:gap-3">
				<Button onclick={reset} flash={flashKey === 'r'} class="justify-center py-2 lg:py-2.5">
					<span class="text-xs lg:text-sm">Reset</span>
					{#if resetSaved}
						<IconCheck size={16} />
					{:else}
						<IconRestore size={16} />
					{/if}
				</Button>

				<Button onclick={snapshot} flash={flashKey === 's'} class="justify-center bg-neutral-100 hover:bg-neutral-200 border-none py-2 lg:py-2.5">
					<span class="text-xs lg:text-sm">Save Edits</span>
					{#if snapshotSaved}
						<IconCheck size={16} />
					{:else}
						<div class="relative">
							<IconDeviceFloppy size={16} />
							{#if edits.hasChanges}
								<span class="absolute -top-0.5 -right-0.5 block h-1.5 w-1.5 rounded-full bg-neutral-800"></span>
							{/if}
						</div>
					{/if}
				</Button>
			</div>

			<!-- Navigation Controls -->
			<div class="mt-4 flex items-center justify-between border-t border-neutral-800 pt-3 lg:mt-6 lg:pt-4">
				<div class="flex items-center gap-4">
					{#if data.previousImage}
						<Tooltip text="Previous Image" position="top">
							<a
								href={`/editor/${data.previousImage}?filter=${page.url.searchParams.get('filter')}`}
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

					<div class="text-[10px] font-bold text-neutral-600 uppercase tracking-[0.2em]">
						Nav
					</div>

					{#if data.nextImage}
						<Tooltip text="Next Image" position="top">
							<a
								href={`/editor/${data.nextImage}?filter=${page.url.searchParams.get('filter')}`}
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
						{@const filter = page.url.searchParams.get('filter')}
						{@const hasFilter = filter !== null && filter !== 'none'}
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

{#if showLutPicker}
	<LutPicker luts={data.luts} onClose={() => (showLutPicker = false)} imageId={page.params.img!} />
{/if}

{#if showFilterModal}
	<FilterModal onClose={() => (showFilterModal = false)} />
{/if}

{#if page.url.searchParams.has('snapshot')}
	<Snapshots snapshots={data.snapshots} profiles={data.profiles} />
{/if}

<style>
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
		0% { transform: scale(1); }
		50% { transform: scale(1.2); background-color: rgba(255, 255, 255, 0.2); }
		100% { transform: scale(1); }
	}
</style>
