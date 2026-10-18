<script lang="ts">
	import type { TriageImage } from '$lib/similar-images';
	import { untrack } from 'svelte';
	import { IconArchive } from '$lib/ui/icons';
	import { fade } from 'svelte/transition';

	let { images, currentImageId }: { images: TriageImage[]; currentImageId: number } = $props();
	let imageElements: (HTMLAnchorElement | null)[] = [];

	$effect(() => {
		const currentIndex = images.findIndex((img) => img.id === currentImageId);
		if (currentIndex !== -1) {
			untrack(() => {
				const element = imageElements[currentIndex];
				element?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
			});
		}
	});
</script>

<div class="custom-scrollbar flex h-full flex-row gap-3 overflow-x-auto scroll-smooth bg-neutral-950 p-4 lg:flex-col lg:overflow-x-hidden lg:overflow-y-auto">
	{#each images as image, i (image.id)}
		<a
			bind:this={imageElements[i]}
			href={`/triage/${image.id}`}
			class="group relative block aspect-[3/2] w-32 flex-shrink-0 overflow-hidden rounded-lg ring-2 ring-transparent transition-all duration-300 lg:w-full"
			class:ring-neutral-100={image.id === currentImageId}
			class:opacity-100={image.id === currentImageId}
			class:opacity-60={image.id !== currentImageId && !image.isArchived}
			class:hover:opacity-100={image.id !== currentImageId}
			class:shadow-2xl={image.id === currentImageId}
			aria-label={`View image ${image.id}`}
			data-sveltekit-preload-data="hover"
		>
			<img
				src={`/api/images/${image.id}/preview`}
				alt={`Preview of image ${image.id}`}
				loading="lazy"
				class="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
			/>

			{#if image.isArchived}
				<div transition:fade class="absolute inset-0 flex items-center justify-center bg-neutral-950/60 backdrop-blur-[2px]">
					<IconArchive size={20} class="text-neutral-400" />
				</div>
			{/if}

			{#if image.id === currentImageId}
				<div class="absolute inset-0 rounded-lg ring-1 ring-white/20 ring-inset"></div>
			{/if}
		</a>
	{/each}
</div>

<style>
	.custom-scrollbar::-webkit-scrollbar {
		width: 4px;
		height: 4px;
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
