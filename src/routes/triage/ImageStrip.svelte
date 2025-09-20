 <script lang="ts">
	import type { Image } from '$lib/server/db/schema';
    import { IconArchive } from '$lib/ui/icons';
    import { fade } from 'svelte/transition';

	let { images, currentImageId }: { images: Image[]; currentImageId: number } = $props();
    let imageElements: (HTMLAnchorElement | null)[] = [];

    $effect(() => {
        const currentIndex = images.findIndex(img => img.id === currentImageId);
        if (currentIndex !== -1) {
            const element = imageElements[currentIndex];
            element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    });
</script>

<div class="image-strip">
	{#each images as image, i}
		<a
            bind:this={imageElements[i]}
			href={`/triage/${image.id}`}
			class="thumbnail relative"
			class:current={image.id === currentImageId}
			aria-label={`View image ${image.id}`}
			data-sveltekit-preload-data="hover"
		>
			<img src={`/api/images/${image.id}/preview`} alt={`Preview of image ${image.id}`} loading="lazy" />
            {#if image.isArchived}
                <div transition:fade class="absolute inset-0 flex items-center justify-center bg-black/50">
                    <IconArchive />
                </div>
            {/if}
		</a>
	{/each}
</div>

<style>
	.image-strip {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		padding: 1rem;
		overflow-y: auto;
		height: 100%;
		background-color: var(--bg-1, #111);
	}

	.thumbnail {
		display: block;
		border: 2px solid transparent;
		border-radius: 0.25rem;
		transition: border-color 0.2s ease;
	}

	.thumbnail:hover {
		border-color: var(--border-2, #343434);
	}

	.thumbnail.current {
		border-color: var(--text-0, #fafafa);
	}

	img {
		display: block;
		width: 100%;
		height: auto;
		border-radius: 0.125rem;
	}
</style>
