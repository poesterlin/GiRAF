<script lang="ts">
	import { onMount } from 'svelte';
	import { IconChevronRight, IconChevronLeft, IconX } from '$lib/ui/icons';

	let { data } = $props();

	let currentIndex = $state(0);

	function nextImage() {
		currentIndex = (currentIndex + 1) % data.images.length;
	}

	function prevImage() {
		currentIndex = (currentIndex - 1 + data.images.length) % data.images.length;
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'ArrowRight') {
			nextImage();
		} else if (event.key === 'ArrowLeft') {
			prevImage();
		} else if (event.key === 'Escape') {
			window.location.href = '/exporter';
		}
	}

	onMount(() => {
		window.addEventListener('keydown', handleKeydown);
		return () => {
			window.removeEventListener('keydown', handleKeydown);
		};
	});

	let isDragging = false;
	let startX = 0;
	const swipeThreshold = 50; // Minimum pixels for a swipe

	function handleMouseDown(event: MouseEvent) {
		isDragging = true;
		startX = event.clientX;
	}

	function handleMouseUp(event: MouseEvent) {
		if (!isDragging) return;
		isDragging = false;
		const deltaX = event.clientX - startX;
		if (Math.abs(deltaX) > swipeThreshold) {
			if (deltaX < 0) {
				nextImage();
			} else {
				prevImage();
			}
		}
	}

	function handleTouchStart(event: TouchEvent) {
		if (event.touches.length !== 1) return;
		isDragging = true;
		startX = event.touches[0].clientX;
	}

	function handleTouchEnd(event: TouchEvent) {
		if (!isDragging || event.changedTouches.length !== 1) return;
		isDragging = false;
		const deltaX = event.changedTouches[0].clientX - startX;
		if (Math.abs(deltaX) > swipeThreshold) {
			if (deltaX < 0) {
				nextImage();
			} else {
				prevImage();
			}
		}
	}
</script>

<svelte:head>
	<title>GiRAF | Exporter: {data.session.name}</title>
</svelte:head>

<div
	class="relative flex h-full w-full select-none items-center justify-center bg-black overflow-hidden"
	onmousedown={handleMouseDown}
	onmouseup={handleMouseUp}
	onmouseleave={() => (isDragging = false)}
	ontouchstart={handleTouchStart}
	ontouchend={handleTouchEnd}
	role="presentation"
>
	<!-- Top Bar -->
	<div class="absolute top-0 left-0 right-0 z-30 flex items-center justify-between p-6 bg-linear-to-b from-black/80 to-transparent">
		<div class="flex items-center gap-4">
			<a
				href="/exporter"
				class="flex h-10 w-10 items-center justify-center rounded-xl bg-neutral-900/50 text-neutral-400 backdrop-blur-xl border border-neutral-800 transition-all hover:bg-neutral-800 hover:text-neutral-100"
				aria-label="Back to Exporter"
			>
				<IconChevronLeft size={24} />
			</a>
			<div class="flex flex-col">
				<h1 class="text-lg font-black italic uppercase tracking-tighter text-neutral-100">{data.session.name}</h1>
			</div>
		</div>
		
		<a
			href="/exporter"
			class="flex h-12 w-12 items-center justify-center rounded-2xl bg-neutral-900/50 text-neutral-100 backdrop-blur-xl border border-neutral-800 hover:bg-neutral-800"
		>
			<IconX size={24} />
		</a>
	</div>

	{#if data.images.length > 0}
		<div class="relative flex h-full w-full items-center justify-center p-12">
			<img
				src={`/api/exporter/sessions/${data.session.id}/${data.images[currentIndex]}`}
				alt={`Exported image ${currentIndex + 1} for session ${data.session.name}`}
				class="h-full w-full max-w-full max-h-full object-contain"
			/>
		</div>

		<!-- Navigation Controls -->
		<div class="absolute inset-y-0 left-0 z-20 flex items-center p-6">
			<button
				onclick={prevImage}
				class="flex h-14 w-14 items-center justify-center rounded-2xl bg-neutral-900/20 text-neutral-400 backdrop-blur-md border border-neutral-800/50 hover:bg-neutral-900 hover:text-neutral-100"
			>
				<IconChevronLeft size={32} />
			</button>
		</div>

		<div class="absolute inset-y-0 right-0 z-20 flex items-center p-6">
			<button
				onclick={nextImage}
				class="flex h-14 w-14 items-center justify-center rounded-2xl bg-neutral-900/20 text-neutral-400 backdrop-blur-md border border-neutral-800/50 hover:bg-neutral-900 hover:text-neutral-100"
			>
				<IconChevronRight size={32} />
			</button>
		</div>

		<!-- Counter -->
		<div class="absolute bottom-8 left-1/2 z-30 -translate-x-1/2 flex items-center gap-3">
			<div class="flex items-center gap-2 rounded-full bg-neutral-900/50 px-6 py-2 text-xs font-black tracking-widest text-neutral-100 backdrop-blur-xl border border-neutral-800">
				<span class="text-neutral-500">{currentIndex + 1}</span>
				<span class="text-neutral-700">/</span>
				<span>{data.images.length}</span>
			</div>
		</div>
	{:else}
		<div class="text-center">
			<div class="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-3xl bg-neutral-900 text-neutral-700">
				<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
			</div>
			<h3 class="text-2xl font-black italic uppercase tracking-tighter text-neutral-100">No exports found</h3>
			<p class="mt-2 font-medium text-neutral-500 max-w-xs">It seems this session has a folder but no JPG files inside it.</p>
			
			<a
				href="/exporter"
				class="mt-8 inline-flex items-center gap-2 rounded-2xl bg-neutral-100 px-8 py-3 text-sm font-black tracking-tight text-neutral-950 hover:bg-white"
			>
				Return to Exporter
			</a>
		</div>
	{/if}
</div>

<style>
	:global(main) {
		padding: 0 !important;
		margin: 0 !important;
		max-width: none !important;
	}
</style>