<script lang="ts">
	import { onMount } from 'svelte';
	let { imageId, archiving = false }: { imageId: number; archiving?: boolean } = $props();
	let desktop = $state(false);
	let ready = $state<{ id: number; url: string } | null>(null);
	const thumbnail = $derived(`/api/images/${imageId}/preview`);
	const displayed = $derived(ready?.id === imageId ? ready.url : thumbnail);
	onMount(() => {
		const media = window.matchMedia('(min-width: 1024px)');
		const update = () => { desktop = media.matches; };
		update();
		media.addEventListener('change', update);
		return () => media.removeEventListener('change', update);
	});
	$effect(() => {
		const id = imageId;
		const sizes = desktop ? [1600, 4096] : [1024, 2048];
		let active = true;
		let pending: HTMLImageElement | undefined;
		void (async () => {
			for (const size of sizes) {
				if (!active) return;
				const url = `/api/images/${id}/preview?size=${size}&quality=${size === 4096 ? 90 : 80}&mode=inside`;
				pending = new Image();
				pending.src = url;
				try {
					await pending.decode();
					if (active) ready = { id, url };
				} catch {
					// Keep the last ready image while trying the next resolution.
				}
			}
		})();
		return () => { active = false; if (pending) pending.removeAttribute('src'); };
	});
</script>

<img
	src={displayed}
	alt={`Image ${imageId}`}
	class="h-full w-full rounded-lg object-contain shadow-2xl transition-transform duration-500"
	class:scale-95={archiving}
	class:opacity-50={archiving}
/>
