<script lang="ts">
	import PreviewLoading from './PreviewLoading.svelte';
	import { onDestroy } from 'svelte';
	import { IconChevronRight } from '$lib/ui/icons';

	const { beforeImage, savedImage, afterImage, imageId, isLoading = false } = $props<{
		beforeImage: string;
		savedImage: string;
		afterImage: string;
		imageId: number;
		isLoading?: boolean;
	}>();
	let comparison = $state('original');
	let labelsVisible = $state(true);
	let labelTimer: ReturnType<typeof setTimeout> | undefined;
	function revealLabels() {
		labelsVisible = true;
		clearTimeout(labelTimer);
		labelTimer = setTimeout(() => { labelsVisible = false; }, 3000);
	}
	$effect(() => { imageId; revealLabels(); });
	onDestroy(() => clearTimeout(labelTimer));
	const comparisonImage = $derived(comparison === 'saved' ? savedImage : beforeImage);

	let readyPreview = $state<{ imageId: number; url: string } | null>(null);
	const displayedPreview = $derived(readyPreview && readyPreview.imageId === imageId ? readyPreview.url : beforeImage);
	const showingEdited = $derived(readyPreview?.imageId === imageId);

	$effect(() => {
		const url = afterImage;
		const id = imageId;
		if (!url) return;
		let active = true;
		const preview = new Image();
		preview.src = url;
		void preview.decode().then(() => {
			if (active) readyPreview = { imageId: id, url };
		}).catch(() => {
			// Keep the original or last ready preview if the next image fails to load.
		});
		return () => { active = false; };
	});

	let split = $state(0.5);

	// Shared transform for both images
	let scale = $state(1);
	let x = $state(0);
	let y = $state(0);

	let containerEl: HTMLElement | undefined = $state();
	let sliderEl: HTMLElement | undefined = $state();
	let isDraggingSlider = $state(false);

	const pointers = new Map<number, PointerEvent>();
	let lastMidpoint: { x: number; y: number } | null = null;
	let lastDistance = 0;
	let tapStart: { id: number; x: number; y: number; time: number } | null = null;
	let lastTap: { x: number; y: number; time: number; type: string } | null = null;
	$effect(() => {
		imageId;
		scale = 1; x = 0; y = 0;
		tapStart = null; lastTap = null;
		pointers.clear(); lastMidpoint = null; lastDistance = 0;
	});

	function applyChange(opts: { panX?: number; panY?: number; scaleDiff?: number; originX?: number; originY?: number }) {
		const { panX = 0, panY = 0, scaleDiff = 1, originX = 0, originY = 0 } = opts;

		let newScale = scale * scaleDiff;
		newScale = Math.max(0.1, Math.min(newScale, 100));
		const finalScaleDiff = newScale / scale;

		const newX = originX - (originX - x) * finalScaleDiff + panX;
		const newY = originY - (originY - y) * finalScaleDiff + panY;

		scale = newScale;
		x = newX;
		y = newY;
	}

	// Zoom with wheel/trackpad pinch (ctrlKey on some devices)
	function onWheel(event: WheelEvent) {
		revealLabels();
		event.preventDefault();
		if (!containerEl) return;

		const rect = containerEl.getBoundingClientRect();
		const deltaY = event.deltaY;
		const zoomingOut = deltaY > 0;
		const divisor = event.ctrlKey ? 100 : 300;
		const ratio = 1 - (zoomingOut ? -deltaY : deltaY) / divisor;
		const scaleDiff = zoomingOut ? 1 / ratio : ratio;

		applyChange({
			scaleDiff,
			originX: event.clientX - rect.left,
			originY: event.clientY - rect.top
		});
	}

	// Pan/Pinch on the container
	function onPointerDown(event: PointerEvent) {
		revealLabels();
		if ((event.target as HTMLElement).closest('select, button, a, input') || event.button !== 0) return;
		if (!containerEl) return;
		containerEl.setPointerCapture(event.pointerId);
		pointers.set(event.pointerId, event);

		if (pointers.size === 1) {
			tapStart = { id: event.pointerId, x: event.clientX, y: event.clientY, time: performance.now() };
			lastMidpoint = { x: event.clientX, y: event.clientY };
		} else if (pointers.size === 2) {
			tapStart = null; lastTap = null;
			const [p1, p2] = Array.from(pointers.values());
			lastMidpoint = {
				x: (p1.clientX + p2.clientX) / 2,
				y: (p1.clientY + p2.clientY) / 2
			};
			lastDistance = Math.hypot(p1.clientX - p2.clientX, p1.clientY - p2.clientY);
		}
	}

	function onPointerMove(event: PointerEvent) {
		revealLabels();
		if (!pointers.has(event.pointerId)) return;
		if (tapStart && Math.hypot(event.clientX - tapStart.x, event.clientY - tapStart.y) > 10) { tapStart = null; lastTap = null; }
		pointers.set(event.pointerId, event);

		if (pointers.size === 1 && lastMidpoint) {
			const panX = event.clientX - lastMidpoint.x;
			const panY = event.clientY - lastMidpoint.y;
			lastMidpoint = { x: event.clientX, y: event.clientY };
			applyChange({ panX, panY });
		} else if (pointers.size === 2 && containerEl && lastMidpoint) {
			const [p1, p2] = Array.from(pointers.values());
			const newMidpoint = {
				x: (p1.clientX + p2.clientX) / 2,
				y: (p1.clientY + p2.clientY) / 2
			};
			const newDistance = Math.hypot(p1.clientX - p2.clientX, p1.clientY - p2.clientY);

			const panX = newMidpoint.x - lastMidpoint.x;
			const panY = newMidpoint.y - lastMidpoint.y;
			const scaleDiff = lastDistance > 0 ? newDistance / lastDistance : 1;

			const rect = containerEl.getBoundingClientRect();
			applyChange({
				panX,
				panY,
				scaleDiff,
				originX: newMidpoint.x - rect.left,
				originY: newMidpoint.y - rect.top
			});

			lastMidpoint = newMidpoint;
			lastDistance = newDistance;
		}
	}

	function onPointerUp(event: PointerEvent) {
		if (!pointers.has(event.pointerId)) return;
		const now = performance.now();
		if (event.type === 'pointerup' && tapStart?.id === event.pointerId && now - tapStart.time < 300 && Math.hypot(event.clientX - tapStart.x, event.clientY - tapStart.y) <= 10) {
			if (lastTap && lastTap.type === event.pointerType && now - lastTap.time < 350 && Math.hypot(event.clientX - lastTap.x, event.clientY - lastTap.y) < 32 && containerEl) {
				if (scale > 1.05) { scale = 1; x = 0; y = 0; }
				else {
					const rect = containerEl.getBoundingClientRect();
					applyChange({ scaleDiff: 3.2 / scale, originX: event.clientX - rect.left, originY: event.clientY - rect.top });
				}
				lastTap = null;
			} else lastTap = { x: event.clientX, y: event.clientY, time: now, type: event.pointerType };
		} else lastTap = null;
		tapStart = null;
		pointers.delete(event.pointerId);
		if (pointers.size < 2) lastDistance = 0;
		const remaining = pointers.values().next().value;
		lastMidpoint = remaining ? { x: remaining.clientX, y: remaining.clientY } : null;
	}

	// Slider drag (use pointer capture on the slider itself)
	function onSliderPointerDown(event: PointerEvent) {
		revealLabels();
		event.stopPropagation();
		tapStart = null; lastTap = null;
		isDraggingSlider = true;
		sliderEl?.setPointerCapture(event.pointerId);
	}

	function onSliderPointerMove(event: PointerEvent) {
		revealLabels();
		if (!isDraggingSlider || !containerEl) return;
		event.stopPropagation();
		const rect = containerEl.getBoundingClientRect();
		const newSplit = (event.clientX - rect.left) / rect.width;
		split = Math.max(0, Math.min(1, newSplit));
	}

	function onSliderPointerUp(event: PointerEvent) {
		if (!isDraggingSlider) return;
		event.stopPropagation();
		isDraggingSlider = false;
		sliderEl?.releasePointerCapture(event.pointerId);
	}
</script>

<div
	class="container group lg:rounded-xl shadow-2xl overflow-hidden border border-neutral-800"
	class:labels-idle={!labelsVisible}
	onfocusin={revealLabels}
	bind:this={containerEl}
	onwheel={onWheel}
	onpointerdown={onPointerDown}
	onpointermove={onPointerMove}
	onpointerup={onPointerUp}
	onpointercancel={onPointerUp}
	onlostpointercapture={onPointerUp}
	style:--split={`${split * 100}%`}
	style:cursor={isDraggingSlider ? 'ew-resize' : 'grab'}
>
	<!-- Before -->
	<div class="pane">
		<img src={comparisonImage} alt={comparison === 'saved' ? 'Currently saved version' : 'Original'} draggable="false" style:transform={`translate(${x}px, ${y}px) scale(${scale})`} />
	</div>

	<!-- After (clipped) -->
	<div class="pane after-pane">
		<img src={displayedPreview} alt={showingEdited ? 'After' : 'Original preview'} draggable="false" style:transform={`translate(${x}px, ${y}px) scale(${scale})`} />
	</div>

	<div class="comparison-label absolute top-4 left-4 z-30 rounded-full border border-neutral-700/50 bg-neutral-950/40 text-[10px] font-bold tracking-widest uppercase text-neutral-300 backdrop-blur-md">
		<select bind:value={comparison} aria-label="Left comparison version" class="cursor-pointer appearance-none rounded-full bg-transparent py-1 pl-3 pr-7 text-[10px] font-bold tracking-widest uppercase focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-300">
			<option value="original" class="bg-neutral-900">Original</option>
			<option value="saved" class="bg-neutral-900">Saved</option>
		</select>
		<IconChevronRight size={12} class="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 rotate-90" />
	</div>
	<div class="absolute top-4 right-4 z-30 flex flex-col items-center gap-2">
		<div class="comparison-label rounded-full border border-neutral-700/50 bg-neutral-100 px-3 py-1 text-[10px] font-bold tracking-widest uppercase text-neutral-950 backdrop-blur-md">
			Edited
		</div>
	</div>
	<PreviewLoading loading={isLoading} overlay />

	<!-- Slider -->
	<div
		class="slider"
		bind:this={sliderEl}
		onpointerdown={onSliderPointerDown}
		onpointermove={onSliderPointerMove}
		onpointerup={onSliderPointerUp}
		onpointercancel={onSliderPointerUp}
		onlostpointercapture={onSliderPointerUp}
	>
		<div class="flex h-7 w-7 lg:h-10 lg:w-10 items-center justify-center rounded-full border border-white/20 bg-white/10 backdrop-blur-xl shadow-lg transition-transform hover:scale-110">
			<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="text-white">
				<path d="m9 18-6-6 6-6"/>
				<path d="m15 6 6 6-6 6"/>
			</svg>
		</div>
	</div>
</div>

<style>
	.comparison-label { transition: opacity 250ms ease; }
	.labels-idle .comparison-label:not(:focus-within) { opacity: 0; pointer-events: none; }
	@media (prefers-reduced-motion: reduce) { .comparison-label { transition: none; } }
	.container {
		position: relative;
		width: 100%;
		height: 100%;
		user-select: none;
		touch-action: none;
		background: #050505;
	}

	.pane {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		overflow: hidden;
	}

	.pane img {
		width: 100%;
		height: 100%;
		object-fit: contain;
		pointer-events: none;
		transform-origin: 0 0;
	}

	/* Show only the right side of "after" based on --split */
	.after-pane {
		clip-path: inset(0 0 0 var(--split));
	}

	.slider {
		position: absolute;
		top: 0;
		left: var(--split);
		transform: translateX(-50%);
		width: 2px;
		height: 100%;
		background: rgba(255, 255, 255, 0.4);
		cursor: ew-resize;
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 20;
		touch-action: none;
		transition: background 0.2s ease;

		&::after {
			position: absolute;
			content: '';
			top: 0;
			left: 50%;
			transform: translateX(-50%);
			width: 40px;
			height: 100%;
		}

		&:hover {
			background: rgba(255, 255, 255, 0.8);
		}
	}
</style>
