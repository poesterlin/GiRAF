<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import { getWorkerInstance } from '$lib';
	import BasePP3 from '$lib/assets/client.pp3?raw';
	import { filterPP3, stringifyPP3, toBase64 } from '$lib/pp3-utils';
	import { edits } from '$lib/state/editing.svelte';
	import BeforeAfter from '$lib/ui/BeforeAfter.svelte';
	import Button from '$lib/ui/Button.svelte';
	import EditModeNav from '$lib/ui/EditModeNav.svelte';
	import LutPicker from '$lib/ui/LutPicker.svelte';
	import { IconArchive, IconCheck, IconChevronLeft, IconChevronRight, IconDeviceFloppy, IconFidgetSpinner, IconRestore } from '$lib/ui/icons';
	import { onMount } from 'svelte';
	import { fade } from 'svelte/transition';
	import Adjustments from './Adjustments.svelte';
	import Snapshots from './Snapshots.svelte';
	import { tagStore } from '$lib/state/tag.svelte';

	let { data } = $props();
	let showLutPicker = $state(false);

	let sampleImage = $state('');
	let apiPath = $derived(`/api/images/${data.image.id}`);
	let snapshotSaved = $state(false);
	let beforeImage = $derived(apiPath + `/edit?preview&config=${toBase64(filterPP3(edits.throttledPP3, ['Crop', 'Rotation']))}`);

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
		const res = await fetch(`/api/images/${page.params.img}/snapshots`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ pp3: stringifyPP3($state.snapshot(edits.pp3)) })
		});
		if (res.ok) {
			snapshotSaved = true;
			await invalidateAll();
		} else {
			// Handle error (optional)
			alert('Failed to save snapshot.');
		}

		setTimeout(() => {
			snapshotSaved = false;
		}, 2000);
	}

	onMount(() => {
		const latestSnapshot = data.snapshots[0];
		if (latestSnapshot) {
			console.log('Loading latest snapshot PP3', latestSnapshot.pp3);
			edits.initialize(latestSnapshot.pp3);
		} else {
			edits.initialize(BasePP3);
		}
	});

	$effect(() => {
		const worker = getWorkerInstance();
		edits.isLoading = true;
		worker
			.refreshImage(page.params.img!, toBase64(edits.throttledPP3))
			.then((result) => {
				sampleImage = result.url;
				edits.isFaulty = result.error;
				edits.isLoading = false;
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
</script>

<div class="image-editor">
	<div class="editor-layout">
		<!-- Image Preview -->
		<div class="image-preview">
			<BeforeAfter {beforeImage} afterImage={sampleImage} />
			<EditModeNav img={page.params.img!} showCrop showSnapshots showReset showClipboard showFlag />
		</div>

		<!-- Controls Panel -->
		<div class="controls-panel">
			<div class="panel-header">
				<h2 class="panel-title">Adjustments</h2>
				{#if edits.isLoading}
					<div in:fade={{ duration: 200, delay: 200 }}>
						<IconFidgetSpinner class="animate-spin" size={24} />
					</div>
				{/if}
			</div>

			<div class="controls-sections">
				{#if edits.pp3}
					<Adjustments {data} bind:showLutPicker />
				{/if}
			</div>

			<div class="flex flex-col justify-between gap-2 border-t border-neutral-800 p-4">
				{#if data.image.isArchived}
					<Button aria-label="Restore Image" onclick={restoreImage}>
						<span>Restore Image</span>
						<IconRestore />
					</Button>
				{:else}
					<Button onclick={archiveImage} aria-label="Archive Image">
						<span>Archive Image</span>
						<IconArchive />
					</Button>
				{/if}
				<Button onclick={snapshot}>
					<span>Save Edits</span>
					{#if snapshotSaved}
						<IconCheck />
					{:else}
						<IconDeviceFloppy />
					{/if}
				</Button>
				<div class="mt-2 flex flex-row justify-between gap-2">
					{#if data.previousImage}
						<a href={`/editor/${data.previousImage}`} class="p-4" title="Previous Image">
							<IconChevronLeft />
						</a>
					{:else}
						<span class="opacity-50 cursor-not-allowed p-4">
							<IconChevronLeft />
						</span>
					{/if}
					{#if data.nextImage}
						<a href={`/editor/${data.nextImage}`} class="p-4" title="Next Image">
							<IconChevronRight />
						</a>
					{:else}
						<span class="opacity-50 cursor-not-allowed p-4">
							<IconChevronRight />
						</span>
					{/if}
				</div>
			</div>
		</div>
	</div>
</div>

{#if showLutPicker}
	<LutPicker luts={data.luts} onClose={() => (showLutPicker = false)} imageId={page.params.img!} />
{/if}

{#if page.url.searchParams.has('snapshot')}
	<Snapshots snapshots={data.snapshots} />
{/if}

<style>
	/* Minimalist grayscale palette */
	:root {
		--bg-0: #0e0e0e;
		--bg-1: #111111;
		--bg-2: #151515;
		--bg-3: #1e1e1e;
		--bg-4: #262626;

		--border-1: #2a2a2a;
		--border-2: #343434;

		--text-0: #fafafa;
		--text-1: #e7e7e7;
		--text-2: #cfcfcf;
		--text-3: #b5b5b5;

		--muted: #9a9a9a;
	}

	.image-editor {
		background: var(--bg-0);
		color: var(--text-1);
		overflow: hidden;
		height: 100%;
	}

	.editor-layout {
		display: grid;
		grid-template-columns: 1fr 350px;
		height: 100%;
	}

	/* Image Preview */
	.image-preview {
		background: var(--bg-1);
		display: flex;
		align-items: center;
		justify-content: center;
		position: relative;
		overflow: hidden;
		view-transition-name: 'image-preview';
	}

	/* Controls Panel */
	.controls-panel {
		background: var(--bg-2);
		border-left: 1px solid var(--border-1);
		display: flex;
		flex-direction: column;
		overflow: hidden;
		view-transition-name: 'adjustment-panel';
	}

	.panel-header {
		padding: 1.25rem 1.5rem;
		border-bottom: 1px solid var(--border-1);
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.panel-title {
		margin: 0;
		font-size: 1.125rem;
		font-weight: 600;
		color: var(--text-0);
	}

	.controls-sections {
		flex: 1;
		overflow-y: auto;
		padding: 1rem 1.25rem 1.25rem;
	}

	/* Responsive */
	@media (max-width: 1024px) {
		.editor-layout {
			grid-template-columns: 1fr;
			grid-template-rows: 1fr auto;
		}

		.controls-panel {
			max-height: 50vh;
			border-left: none;
			border-top: 1px solid var(--border-1);
		}
	}
</style>
