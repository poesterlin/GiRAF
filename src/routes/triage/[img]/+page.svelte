<script lang="ts">
	import { beforeNavigate, goto, invalidateAll, preloadData } from '$app/navigation';
	import { page } from '$app/state';
	import { tagStore } from '$lib/state/tag.svelte';
	import FlagModal from '$lib/ui/FlagModal.svelte';
	import Tooltip from '$lib/ui/Tooltip.svelte';
	import { IconArchive, IconChevronLeft, IconChevronRight, IconFlag, IconRestore, IconAdjustmentsFilled } from '$lib/ui/icons';
	import ImageStrip from '../ImageStrip.svelte';

	let { data } = $props();

	let showTagModal = $state(false);
	let isArchiving = $state(false);
	let justRestored = $state(false);
	let isRestoring = $state(false);
	let navigationVersion = 0;
	beforeNavigate(() => { navigationVersion += 1; });

	async function archiveImage() {
		if (isArchiving || isRestoring || data.image.isArchived) return;
		const imageId = data.image.id;
		const nextImage = data.nextImage;
		const version = navigationVersion;
		isArchiving = true;
		try {
			await new Promise((r) => setTimeout(r, 300));

			const res = await fetch(`/api/images/${imageId}/archive`, {
				method: 'POST'
			});
			if (res.ok) {
				await invalidateAll();
				if (nextImage && navigationVersion === version && data.image.id === imageId) {
					await goto(`/triage/${nextImage}`);
				}
			} else {
				alert('Failed to archive image.');
			}
		} catch (error) {
			console.error('Failed to archive image', error);
			alert('Failed to archive image.');
		} finally {
			isArchiving = false;
		}
	}

	async function restoreImage() {
		if (isArchiving || isRestoring || !data.image.isArchived) return;
		const imageId = data.image.id;
		const version = navigationVersion;
		isRestoring = true;
		try {
			const res = await fetch(`/api/images/${imageId}/archive`, {
				method: 'DELETE'
			});
			if (res.ok) {
				await invalidateAll();
				if (navigationVersion === version && data.image.id === imageId) {
					justRestored = true;
					setTimeout(() => (justRestored = false), 1000);
				}
			} else {
				alert('Failed to restore image.');
			}
		} catch (error) {
			console.error('Failed to restore image', error);
			alert('Failed to restore image.');
		} finally {
			isRestoring = false;
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

<div class="flex h-full flex-col overflow-hidden bg-neutral-950 font-sans lg:flex-row">
	<!-- Image Strip (Left on Desktop, Bottom on Mobile) -->
	<aside class="order-2 border-neutral-800 bg-neutral-950 lg:order-1 lg:w-[240px] lg:border-r border-t lg:border-t-0 flex-shrink-0">
		<div class="h-full overflow-y-auto custom-scrollbar">
			<ImageStrip images={data.sessionImages} currentImageId={data.image.id} />
		</div>
	</aside>

	<!-- Main Preview Area -->
	<main class="relative order-1 flex-1 overflow-hidden bg-neutral-900 lg:order-2">
		<div class="flex h-full items-center justify-center p-4">
			<picture class="flex h-full w-full items-center justify-center">
				<source media="(min-width: 1024px)" srcset={`/api/images/${data.image.id}/preview?size=4096&quality=90&mode=inside`} />
				<img
					src={`/api/images/${data.image.id}/preview?size=2048`}
					alt={`Image ${data.image.id}`}
					class="h-full w-full object-contain rounded-lg shadow-2xl transition-transform duration-500"
					class:scale-95={isArchiving}
					class:opacity-50={isArchiving}
				/>
			</picture>
		</div>

		<!-- Left Side Controls -->
		<div class="absolute inset-y-0 left-4 flex flex-col justify-center gap-8 pointer-events-none sm:left-8">
			<div class="pointer-events-auto flex flex-col gap-4">
				<Tooltip text="Restore Image" position="right">
					<button
						onclick={restoreImage}
						aria-label="Restore Image"
						disabled={!data.image.isArchived || isArchiving || isRestoring}
						class="flex h-14 w-14 items-center justify-center rounded-full border border-white/10 bg-neutral-950/40 text-neutral-400 backdrop-blur-md transition-all active:scale-90 disabled:opacity-50 sm:h-16 sm:w-14 shadow-2xl"
						class:text-neutral-100={data.image.isArchived}
						class:bg-neutral-800={data.image.isArchived}
						class:hover:bg-neutral-100={data.image.isArchived}
						class:hover:text-neutral-950={data.image.isArchived}
					>
						<IconRestore size={28} />
					</button>
				</Tooltip>

				{#if data.previousImage}
					<Tooltip text="Previous Image (Left Arrow)" position="right">
						<a
							href={`/triage/${data.previousImage}`}
							class="flex h-24 w-14 items-center justify-center rounded-full border border-white/10 bg-neutral-950/40 text-neutral-400 backdrop-blur-md transition-all hover:bg-neutral-100 hover:text-neutral-950 active:scale-90 sm:w-14 shadow-2xl"
						>
							<IconChevronLeft size={32} />
						</a>
					</Tooltip>
				{/if}

				<Tooltip text="Edit Image" position="right">
					<a
						href={`/editor/${data.image.id}`}
						class="flex h-14 w-14 items-center justify-center rounded-full border border-white/10 bg-neutral-100 text-neutral-950 transition-all hover:bg-neutral-200 active:scale-90 sm:h-16 sm:w-14 shadow-2xl"
					>
						<IconAdjustmentsFilled size={28} />
					</a>
				</Tooltip>
			</div>
		</div>

		<!-- Right Side Controls -->
		<div class="absolute inset-y-0 right-4 flex flex-col justify-center gap-8 pointer-events-none sm:right-8">
			<div class="pointer-events-auto flex flex-col gap-4">
				<Tooltip text="Archive Image" position="left">
					<button
						onclick={archiveImage}
						aria-label="Archive Image"
						disabled={data.image.isArchived || isArchiving || isRestoring}
						class="flex h-14 w-14 items-center justify-center rounded-full border border-white/10 bg-neutral-950/40 text-neutral-100 backdrop-blur-md transition-all active:scale-90 disabled:opacity-10 sm:h-16 sm:w-14 shadow-2xl"
						class:hover:bg-neutral-500={!data.image.isArchived}
						class:hover:text-white={!data.image.isArchived}
					>
						<IconArchive size={28} />
					</button>
				</Tooltip>

				{#if data.nextImage}
					<Tooltip text="Next Image (Right Arrow)" position="left">
						<a
							href={`/triage/${data.nextImage}`}
							data-sveltekit-preload-data="hover"
							class="flex h-24 w-14 items-center justify-center rounded-full border border-white/10 bg-neutral-950/40 text-neutral-400 backdrop-blur-md transition-all hover:bg-neutral-100 hover:text-neutral-950 active:scale-90 sm:w-14 shadow-2xl"
						>
							<IconChevronRight size={32} />
						</a>
					</Tooltip>
				{/if}

				<Tooltip text="Tag Image (T)" position="left">
					<button
						onclick={() => (showTagModal = true)}
						class="flex h-14 w-14 items-center justify-center rounded-full border border-white/10 bg-neutral-950/40 text-neutral-400 backdrop-blur-md transition-all hover:bg-neutral-800 hover:text-neutral-100 active:scale-90 sm:h-16 sm:w-14 shadow-2xl"
					>
						<IconFlag size={28} />
					</button>
				</Tooltip>
			</div>
		</div>
	</main>
</div>

{#if showTagModal}
	<FlagModal img={page.params.img!} onClose={() => (showTagModal = false)} />
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
</style>
