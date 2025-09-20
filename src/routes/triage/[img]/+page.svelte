<script lang="ts">
	import { goto, invalidateAll, preloadData } from '$app/navigation';
	import { page } from '$app/state';
	import { tagStore } from '$lib/state/tag.svelte';
	import FlagModal from '$lib/ui/FlagModal.svelte';
	import { IconArchive, IconChevronLeft, IconChevronRight, IconFlag, IconRestore, IconAdjustmentsFilled } from '$lib/ui/icons';
	import ImageStrip from '../ImageStrip.svelte';

	let { data } = $props();

		let showTagModal = $state(false);
		let isArchiving = $state(false);
		let justRestored = $state(false);
	
		async function archiveImage() {
			isArchiving = true;
			await new Promise((r) => setTimeout(r, 300));
	
			const res = await fetch(`/api/images/${page.params.img}/archive`, {
				method: 'POST'
			});
			if (res.ok) {
				await invalidateAll();
				if (data.nextImage) {
					goto(`/triage/${data.nextImage}`);
				}
			} else {
				alert('Failed to archive image.');
			}
			isArchiving = false;
		}
	
		async function restoreImage() {
			const res = await fetch(`/api/images/${page.params.img}/archive`, {
				method: 'DELETE'
			});
			if (res.ok) {
				await invalidateAll();
				justRestored = true;
				setTimeout(() => (justRestored = false), 1000);
			} else {
				alert('Failed to restore image.');
			}
		}
	$effect(() => {
		tagStore.existingTags = data.tags.map((t) => t.name);
		tagStore.selected = data.imageTags.map((it) => it.name);
	});

	$effect(() => {
		if (data.nextImage) {
			preloadData(`/triage/${data.nextImage}`);
		}
		if (data.previousImage) {
			preloadData(`/triage/${data.previousImage}`);
		}
	});

	const keyMap = $derived(
		new Map<string, () => void>([
			['ArrowRight', () => (data.nextImage ? goto(`/triage/${data.nextImage}`) : undefined)],
			['ArrowLeft', () => (data.previousImage ? goto(`/triage/${data.previousImage}`) : undefined)],
			['a', () => (data.image.isArchived ? restoreImage() : archiveImage())],
			['t', () => (showTagModal = true)]
		])
	);

	function handleKeyUp(event: KeyboardEvent) {
		if (event.target && (event.target as HTMLElement).tagName === 'INPUT') {
			return;
		}
		const action = keyMap.get(event.key);
		if (action) {
			event.preventDefault();
			action();
		}
	}
</script>

<svelte:window onkeyup={handleKeyUp} />

<div class="triage-layout">
	<div class="image-strip-container">
		<ImageStrip images={data.sessionImages} currentImageId={data.image.id} />
	</div>

	<div class="main-content relative">
		<div class="image-preview">
			<img src={`/api/images/${data.image.id}/preview?size=2048`} alt={`Image ${data.image.id}`} />
		</div>

		<!-- Left Controls -->
		<div class="absolute top-1/2 left-4 flex -translate-y-1/2 flex-col items-center gap-12">
			<button
				onclick={restoreImage}
				aria-label="Restore Image"
				disabled={!data.image.isArchived}
				class="rounded-full border border-white/20 bg-black/20 p-4 text-white/80 transition-colors hover:border-white/80 hover:bg-black/50 hover:text-white disabled:cursor-not-allowed disabled:opacity-20"
			>
				<IconRestore size={48} />
			</button>
			{#if data.previousImage}
				<a
					href={`/triage/${data.previousImage}`}
					class="rounded-full border border-white/20 bg-black/20 p-4 text-white/80 transition-colors hover:border-white/80 hover:bg-black/50 hover:text-white"
					title="Previous Image"
				>
					<IconChevronLeft size={48} />
				</a>
			{/if}
			<a
				href={`/editor/${data.image.id}`}
				data-sveltekit-preload-data="hover"
				class="rounded-full border border-white/20 bg-black/20 p-4 text-white/80 transition-colors hover:border-white/80 hover:bg-black/50 hover:text-white"
				title="Edit Image"
			>
				<IconAdjustmentsFilled size={48} />
			</a>
		</div>

		<!-- Right Controls -->
		<div class="absolute top-1/2 right-4 flex -translate-y-1/2 flex-col items-center gap-12">
			<button
				onclick={archiveImage}
				aria-label="Archive Image"
				disabled={data.image.isArchived}
				class="rounded-full border border-white/20 bg-black/20 p-4 text-white/80 transition-colors hover:border-white/80 hover:bg-black/50 hover:text-white disabled:cursor-not-allowed disabled:opacity-20"
			>
				<IconArchive size={48} />
			</button>
			{#if data.nextImage}
				<a
					href={`/triage/${data.nextImage}`}
					data-sveltekit-preload-data="hover"
					class="rounded-full border border-white/20 bg-black/20 p-4 text-white/80 transition-colors hover:border-white/80 hover:bg-black/50 hover:text-white"
					title="Next Image"
				>
					<IconChevronRight size={48} />
				</a>
			{/if}
			<button
				onclick={() => (showTagModal = true)}
				class="rounded-full border border-white/20 bg-black/20 p-4 text-white/80 transition-colors hover:border-white/80 hover:bg-black/50 hover:text-white"
			>
				<IconFlag size={48} />
			</button>
		</div>
	</div>
</div>

{#if showTagModal}
	<FlagModal img={page.params.img!} onClose={() => (showTagModal = false)} />
{/if}

<style>
	.triage-layout {
		display: grid;
		grid-template-columns: 200px 1fr;
		height: calc(100vh - 4rem);
		overflow: hidden;
		background: var(--bg-0, #0e0e0e);
		color: var(--text-1, #e7e7e7);
	}

	.image-strip-container {
		border-right: 1px solid var(--border-1, #2a2a2a);
		overflow-y: auto;
	}

	.main-content {
		display: grid;
		grid-template-rows: 1fr auto;
		overflow: hidden;
	}

	.image-preview {
		display: flex;
		align-items: center;
		justify-content: center;
		overflow: hidden;
		padding: 1rem;
	}

	.image-preview img {
		max-width: 100%;
		max-height: 100%;
		object-fit: contain;
		border-radius: 0.25rem;
	}

	.controls {
		padding: 1rem;
		border-top: 1px solid var(--border-1, #2a2a2a);
		background: var(--bg-2, #151515);
		display: flex;
		justify-content: center;
	}
</style>
