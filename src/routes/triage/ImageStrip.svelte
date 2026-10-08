 <script lang="ts">
	import type { Image } from '$lib/server/db/schema';
	import { untrack } from 'svelte';
    import { IconArchive } from '$lib/ui/icons';
    import { fade } from 'svelte/transition';

	let { images, currentImageId }: { images: Image[]; currentImageId: number } = $props();
    let imageElements: (HTMLAnchorElement | null)[] = [];

    $effect(() => {
        const currentIndex = images.findIndex(img => img.id === currentImageId);
        if (currentIndex !== -1) {
            untrack(() => {
                const element = imageElements[currentIndex];
                element?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
            });
        }
    });
</script>

<div class="flex flex-row lg:flex-col gap-3 p-4 overflow-x-auto lg:overflow-y-auto lg:overflow-x-hidden h-full scroll-smooth custom-scrollbar bg-neutral-950">
	{#each images as image, i (image.id)}
		<a
            bind:this={imageElements[i]}
			href={`/triage/${image.id}`}
			class="relative block flex-shrink-0 w-32 lg:w-full aspect-[3/2] overflow-hidden rounded-lg transition-all duration-300 ring-2 ring-transparent group"
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
                <div class="absolute inset-0 ring-1 ring-inset ring-white/20 rounded-lg"></div>
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
