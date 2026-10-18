<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import { EditorPreviewQueue, getPreviewDevice } from '$lib/editor-preview';
	import BasePP3 from '$lib/assets/client.pp3?raw';
	import { filterPP3, toBase64 } from '$lib/pp3-utils';
	import { app } from '$lib/state/app.svelte';
	import { edits } from '$lib/state/editing.svelte';
	import { tagStore } from '$lib/state/tag.svelte';
	import BeforeAfter from '$lib/ui/BeforeAfter.svelte';
	import EditModeNav from '$lib/ui/EditModeNav.svelte';
	import EditorTools from '$lib/ui/EditorTools.svelte';
	import EditorMobileToolbar from '$lib/ui/EditorMobileToolbar.svelte';
	import LutPicker from '$lib/ui/LutPicker.svelte';
	import { IconFilter } from '$lib/ui/icons';
	import EditorHistoryBinding from '$lib/ui/EditorHistoryBinding.svelte';
	import { onDestroy, untrack } from 'svelte';
	import Adjustments from './Adjustments.svelte';
	import Snapshots from './Snapshots.svelte';
	import FilterModal from '$lib/ui/FilterModal.svelte';

	let { data } = $props();
	let showLutPicker = $state(false);
	let showFilterModal = $state(false);

	let sampleImage = $state('');
	let sampleImageId = $state<string | null>(null);
	const previews = new EditorPreviewQueue(
		(url, imageId, latest) => {
			if (sampleImage.startsWith('blob:')) URL.revokeObjectURL(sampleImage);
			sampleImage = url;
			sampleImageId = imageId;
			edits.isFaulty = false;
			if (latest) edits.isLoading = false;
		},
		(error) => {
			if (error) {
				console.error('Error refreshing image:', error);
				edits.isFaulty = true;
			}
			edits.isLoading = false;
		}
	);
	onDestroy(() => {
		previews.cancel();
		if (sampleImage.startsWith('blob:')) URL.revokeObjectURL(sampleImage);
	});
	let apiPath = $derived(`/api/images/${data.image.id}`);
	let beforeImage = $derived(apiPath + `/edit?preview&config=${toBase64(filterPP3(edits.throttledPP3, ['Crop', 'Rotation']))}`);
	let savedImage = $derived(apiPath + `/edit?preview&config=${toBase64(edits.lastSavedDocument || data.snapshots[0]?.pp3 || data.image.importBaseline || BasePP3)}`);

	$effect(() => {
		if (!data.hasMatchingImages || data.editorError) return;
		const latestSnapshot = data.snapshots[0];
		const image = data.image;
		const pp3 = latestSnapshot?.pp3 ?? image.importBaseline ?? BasePP3;
		untrack(() => edits.initialize(pp3, image));
	});

	$effect(() => {
		if (!data.hasMatchingImages || data.editorError) {
			previews.cancel();
			edits.isLoading = false;
			return;
		}
		edits.isLoading = true;
		// The queue lets an in-flight quick render finish, so dragging keeps updating the photo.
		previews.request(page.params.img!, toBase64(edits.throttledPP3), getPreviewDevice());
	});

	$effect(() => {
		tagStore.existingTags = data.tags.map((t) => t.name);
		tagStore.selected = data.imageTags.map((it) => it.name);
	});

	const keyMap = $derived(new Map<string, () => void>([['p', () => showPreview()]]));

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
			action();
		}
	}

	function showPreview() {
		const url = new URL(apiPath + `/render`, location.origin);
		window.open(url, '_blank');
	}
</script>

<svelte:window onkeydown={handleKeyDown} />

{#if !data.hasMatchingImages}
	<div class="flex h-full items-center justify-center overflow-y-auto bg-neutral-950 px-6 py-12 text-center text-neutral-200">
		<div class="flex max-w-sm flex-col items-center gap-5">
			<div class="rounded-full border border-neutral-700 bg-neutral-900 p-5 text-neutral-400"><IconFilter size={32} /></div>
			<h1 class="text-2xl font-bold">No photos match this filter</h1>
			<div class="flex flex-wrap justify-center gap-3">
				<button class="min-h-12 rounded-xl border border-neutral-600 px-5 font-semibold hover:bg-neutral-800" onclick={() => (showFilterModal = true)}>Change filter</button>
				<a href={`/editor/${data.image.id}?archived=any`} class="flex min-h-12 items-center rounded-xl bg-neutral-100 px-5 font-semibold text-neutral-950 hover:bg-white"
					>Show all photos</a
				>
			</div>
		</div>
	</div>
{:else if data.editorError}
	<div class="flex h-full items-center justify-center overflow-y-auto bg-neutral-950 px-6 py-12 text-center text-neutral-200">
		<div class="flex max-w-md flex-col items-center gap-5" role="alert">
			<div class="rounded-full border border-neutral-700 bg-neutral-900 p-5 text-neutral-300">
				<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"
					><path d="M12 3 2 21h20Z" /><path d="M12 9v5m0 3v1" /></svg
				>
			</div>
			<h1 class="text-2xl font-bold">Photo not ready for editing</h1>
			<p class="text-sm font-semibold text-neutral-300">{data.image.name}</p>
			<p class="text-neutral-400">{data.editorError}</p>
			<div class="flex flex-wrap justify-center gap-3">
				<a href="/gallery" class="flex min-h-12 items-center rounded-xl bg-neutral-100 px-5 font-semibold text-neutral-950">Open Gallery</a>
				<button type="button" class="min-h-12 rounded-xl border border-neutral-600 px-5 font-semibold hover:bg-neutral-800" onclick={() => invalidateAll()}>Check again</button>
			</div>
		</div>
	</div>
{:else}
	<div class="flex h-full flex-col overflow-hidden bg-neutral-950 text-neutral-200 lg:flex-row">
		<!-- Image Preview Section -->
		<div role="region" aria-label="Photo preview" class="relative min-h-0 flex-1 overflow-hidden bg-neutral-900 shadow-inner">
			<div class="flex h-full items-center justify-center p-0 lg:p-2">
				<BeforeAfter {beforeImage} {savedImage} isLoading={edits.isLoading} imageId={data.image.id} afterImage={sampleImageId === String(data.image.id) ? sampleImage : ''} />
			</div>
			<div class="pointer-events-none absolute inset-y-0 left-4 z-30 hidden flex-col justify-center lg:flex">
				<div class="pointer-events-auto"><EditModeNav img={page.params.img!} showSnapshots showClipboard showFlag showLast /></div>
			</div>
			<div class="pointer-events-none absolute right-0 bottom-1 left-0 z-40 flex justify-center lg:hidden">
				<div class="mobile-photo-toolbar pointer-events-auto">
					<EditModeNav img={page.params.img!} showHistory showUndoRedo={false} showSnapshots showClipboard showFlag showLast />
				</div>
			</div>
		</div>

		<!-- Controls Panel Section -->
		<aside
			aria-label="Adjustments"
			class="flex h-[46dvh] min-h-0 w-full shrink-0 flex-col overflow-hidden border-t border-neutral-800 bg-neutral-950 transition-all duration-300 lg:h-auto lg:h-full lg:w-[380px] lg:border-t-0 lg:border-l"
		>
			<div class="hidden shrink-0 px-6 pt-2 lg:block"><EditorTools img={page.params.img!} /></div>
			<EditorHistoryBinding loading={edits.isLoading} />

			<!-- Scrollable Controls -->
			<div data-adjustment-scroll class="custom-scrollbar min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain">
				<EditorMobileToolbar img={page.params.img!} />
				<div class="px-3 py-2 lg:px-6 lg:py-4">
					{#if edits.pp3}
						<Adjustments {data} bind:showLutPicker previewSrc={sampleImageId === String(data.image.id) && !edits.isFaulty ? sampleImage : ''} />
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
