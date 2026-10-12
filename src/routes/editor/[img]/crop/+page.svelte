<script lang="ts">
	import { untrack } from 'svelte';
	import { assert } from '$lib';
	import BasePP3 from '$lib/assets/client.pp3?raw';
	import { beforeNavigate } from '$app/navigation';
	import { app } from '$lib/state/app.svelte';
	import {
		createInitialCrop,
		getAutoFillScale,
		getDisplayDimensions,
		getDisplayScale,
		safeNumber,
		sanitizeCrop,
		scaleCropPP3,
		screenToCropSpace,
		type Dimensions
	} from '$lib/canvas/crop';
	import { checkHandleCollision, drawCropGrid, moveHandle } from '$lib/canvas/grid';
	import { excludePP3, toBase64, type PP3 } from '$lib/pp3-utils';
	import { edits } from '$lib/state/editing.svelte';
	import EditModeNav from '$lib/ui/EditModeNav.svelte';
	import EditorTools from '$lib/ui/EditorTools.svelte';
	import EditorPanelHeader from '$lib/ui/EditorPanelHeader.svelte';
	import Slider from '$lib/ui/Slider.svelte';
	
	let canvasEl = $state<HTMLCanvasElement>();
	let imgEl = $state<HTMLImageElement>();
			
	let { data } = $props();
	let imageDimensions: Dimensions = { width: 0, height: 0 };
	let displayDimensions: Dimensions = { width: 0, height: 0 };
	let autoFillScale = 1;
	let displayScale = 1;
	const padding = 24;
	let isMoving = false;
	let activePointerId: number | null = null;
	let handle: string | undefined = undefined;
	let lastX = 0;
	let lastY = 0;
	let apiPath = $derived(`/api/images/${data.image.id}`);
	let imageUrl = $derived(apiPath + `/edit?preview&config=${toBase64(excludePP3(edits.throttledPP3, ['Crop', 'Rotation']))}`);

	// TODO: Configure autosave behavior in settings
	beforeNavigate(() => {
		if (edits.hasChanges) void edits.snapshot().catch(error => app.addToast(String(error), 'error'));
	});

	$effect(() => {
		const latestSnapshot = data.snapshots[0];
		const image = data.image;
		const pp3 = latestSnapshot?.pp3 ?? image.importBaseline ?? BasePP3;
		untrack(() => edits.initialize(pp3, image));
	});

	$effect(() => {
		const controller = new AbortController();
		fetch(apiPath + '/details', { signal: controller.signal })
			.then((res) => (res.ok ? res.json() : null))
			.then((data) => {
				if (controller.signal.aborted) return;
				imageInfo = data ? { resolutionX: data.resolutionX, resolutionY: data.resolutionY } : undefined;
			})
			.catch(() => {
				if (controller.signal.aborted) return;
				imageInfo = undefined;
			});
		return () => controller.abort();
	});

	let moveCursor = $state(false);
	let imageInfo = $state<{ resolutionX: number; resolutionY: number }>();
	let hasCrop = $derived(!!edits.pp3?.Crop);

	$effect(() => {
		const container = canvasEl?.parentElement;
		if (!container) return;
		let frame = 0;
		const observer = new ResizeObserver(() => {
			cancelAnimationFrame(frame);
			frame = requestAnimationFrame(draw);
		});
		observer.observe(container);
		return () => { observer.disconnect(); cancelAnimationFrame(frame); };
	});

	function startCrop() {
		updateDimensions();
		if (!imageDimensions.width || !imageDimensions.height || !edits.pp3) return;
		const x = Math.round(imageDimensions.width * 0.1);
		const y = Math.round(imageDimensions.height * 0.1);
		edits.pp3.Crop = {
			...createInitialCrop(x, y, imageDimensions),
			W: Math.round(imageDimensions.width * 0.8),
			H: Math.round(imageDimensions.height * 0.8)
		};
		edits.pushHistory();
		requestAnimationFrame(draw);
	}

	let ctx = $derived.by(() => {
		if (!canvasEl) {
			return null;
		}

		const context = canvasEl?.getContext('2d');
		assert(context, 'Failed to get canvas context');
		return context;
	});

	function getRotationDeg() {
		return safeNumber(edits.pp3?.Rotation?.Degree);
	}
	$effect(() => {
		JSON.stringify(edits.pp3?.Crop);
		edits.pp3?.Rotation?.Degree;
		const frame = untrack(() => requestAnimationFrame(draw));
		return () => cancelAnimationFrame(frame);
	});

	function updateDimensions() {
		if (!canvasEl || !imgEl) {
			return;
		}

		imageDimensions = {
			width: imgEl.naturalWidth || imgEl.width,
			height: imgEl.naturalHeight || imgEl.height
		};

		const container = canvasEl.parentElement?.getBoundingClientRect();
		const maxWidth = Math.max(1, (container?.width ?? imageDimensions.width) - padding * 2);
		const maxHeight = Math.max(1, (container?.height ?? imageDimensions.height) - padding * 2);

		if (!imageDimensions.width || !imageDimensions.height) {
			displayScale = 0;
			displayDimensions = { width: 0, height: 0 };
			return;
		}

		const angleDeg = getRotationDeg();
		autoFillScale = getAutoFillScale(imageDimensions.width, imageDimensions.height, angleDeg);
		displayScale = getDisplayScale(imageDimensions.width, imageDimensions.height, maxWidth, maxHeight);
		displayDimensions = getDisplayDimensions(imageDimensions.width, imageDimensions.height, displayScale);
	}

	function getScaledPP3() {
		return scaleCropPP3(edits.pp3, displayScale);
	}

	function draw() {
		if (!canvasEl || !imgEl || !ctx) {
			return;
		}

		updateDimensions();
		if (!displayScale) {
			return;
		}

		const displayW = displayDimensions.width;
		const displayH = displayDimensions.height;
		canvasEl.width = displayW + padding * 2;
		canvasEl.height = displayH + padding * 2;

		// clear canvas
		ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
		ctx.fillStyle = '#000';
		ctx.fillRect(0, 0, canvasEl.width, canvasEl.height);

		// clip to content area to hide black corners from rotation
		ctx.save();
		ctx.beginPath();
		ctx.rect(padding, padding, displayW, displayH);
		ctx.clip();

		// draw rotated image with AutoFill zoom
		const angleDeg = getRotationDeg();
		const angleRad = (angleDeg * Math.PI) / 180;
		const centerX = padding + displayW / 2;
		const centerY = padding + displayH / 2;
		ctx.translate(centerX, centerY);
		ctx.scale(displayScale * autoFillScale, displayScale * autoFillScale);
		ctx.rotate(-angleRad);
		ctx.translate(-imageDimensions.width / 2, -imageDimensions.height / 2);
		ctx.drawImage(imgEl, 0, 0, imageDimensions.width, imageDimensions.height);
		ctx.restore();

		// draw crop grid
		const scaledPP3 = getScaledPP3();
		if (!scaledPP3) {
			return;
		}

		drawCropGrid(ctx, scaledPP3, { padding, selected: handle });
	}


	function move(event: PointerEvent) {
		if (activePointerId !== null && event.pointerId !== activePointerId) return;
		if (!canvasEl || !ctx) {
			return;
		}

		const rect = canvasEl.getBoundingClientRect();
		const cropPoint = screenToCropSpace(
			event.clientX - rect.left,
			event.clientY - rect.top,
			padding,
			displayScale
		);
		const dx = cropPoint.x - lastX;
		const dy = cropPoint.y - lastY;
		lastX = cropPoint.x;
		lastY = cropPoint.y;

		if (!edits.pp3?.Crop || !displayScale) {
			return;
		}

		const scaledPP3 = getScaledPP3();
		if (!scaledPP3) {
			return;
		}

		moveCursor = !!checkHandleCollision(scaledPP3, cropPoint.x * displayScale, cropPoint.y * displayScale, event.pointerType === 'touch' ? 24 : 10);

		if (!isMoving || !handle) {
			return;
		}

		moveHandle(edits.pp3 as PP3<number>, handle, dx, dy, imageDimensions);

		requestAnimationFrame(() => draw());
	}

	function startMove(event: PointerEvent) {
		if (activePointerId !== null || (event.pointerType === 'mouse' && event.button !== 0)) return;
		event.preventDefault();
		const pp3 = edits.pp3;
		if (!pp3) {
			return;
		}

		if (!displayScale) {
			updateDimensions();
		}

		if (!displayScale) {
			return;
		}

		const rect = canvasEl!.getBoundingClientRect();
		const cropPoint = screenToCropSpace(
			event.clientX - rect.left,
			event.clientY - rect.top,
			padding,
			displayScale
		);
		lastX = cropPoint.x;
		lastY = cropPoint.y;

		if (!pp3.Crop) {
			pp3.Crop = createInitialCrop(cropPoint.x, cropPoint.y, imageDimensions);

			handle = 'se';
			isMoving = true;
			activePointerId = event.pointerId;
			moveCursor = true;
			canvasEl?.setPointerCapture(event.pointerId);
			return;
		}

		const scaledPP3 = getScaledPP3();
		handle = scaledPP3
			? checkHandleCollision(scaledPP3, cropPoint.x * displayScale, cropPoint.y * displayScale, event.pointerType === 'touch' ? 24 : 10)
			: undefined;
		if (handle && canvasEl) {
			isMoving = true;
			activePointerId = event.pointerId;
			moveCursor = true;
			canvasEl.setPointerCapture(event.pointerId);
		} else {
			isMoving = false;
		}
	}

	function endMove(event: PointerEvent) {
		if (!canvasEl || activePointerId !== event.pointerId) {
			return;
		}
		
		activePointerId = null;
		isMoving = false;
		handle = undefined;

		if (canvasEl.hasPointerCapture(event.pointerId)) canvasEl.releasePointerCapture(event.pointerId);
		moveCursor = false;

		if (edits.pp3?.Crop) {
			sanitizeCrop(edits.pp3.Crop as unknown as { X: number; Y: number; W: number; H: number }, imageDimensions, imageDimensions);
		}
		edits.pp3 = structuredClone($state.snapshot(edits.pp3));
		edits.pushHistory();

		requestAnimationFrame(() => draw());
	}


</script>


<img src={imageUrl} alt="" class="hidden" bind:this={imgEl} onload={draw} />

<div class="flex h-full flex-col overflow-hidden bg-neutral-950 text-neutral-200 lg:flex-row">
	<!-- Image Preview Section -->
	<div class="relative min-h-0 flex-1 overflow-hidden bg-neutral-900 shadow-inner">
		<div class="flex h-full items-center justify-center p-2 sm:p-2">
			<canvas bind:this={canvasEl} onpointerdown={startMove} onpointermove={move} onpointerup={endMove} onpointercancel={endMove} onlostpointercapture={endMove} aria-label="Crop image: drag corners to resize or drag inside to move" class:cursor-move={moveCursor} class="m-auto touch-none select-none"></canvas>
		</div>
		

	</div>

	<!-- Controls Panel Section -->
	<aside
		class="flex max-h-[45dvh] w-full shrink-0 flex-col border-t border-neutral-800 bg-neutral-950 lg:max-h-none lg:h-full lg:w-[380px] lg:border-t-0 lg:border-l"
	>
		<!-- Panel Header -->
		<EditorPanelHeader title="Crop & Rotate" />
		<div class="flex shrink-0 items-center justify-between border-b border-neutral-800 px-4 py-2 lg:hidden">
			<div class="flex items-center gap-3">
				<div class="h-2 w-2 rounded-full bg-neutral-500"></div>
				<h2 class="text-xs font-bold tracking-widest uppercase text-neutral-400">Crop & Rotate</h2>
			</div>
			<div class="lg:hidden">
				{#if edits.currentImageId}<EditModeNav showEdit img={edits.currentImageId} />{/if}
			</div>
		</div>

		<!-- Scrollable Controls -->
		<div class="min-h-0 flex-1 overflow-y-auto px-4 py-3 lg:px-6 lg:py-4 custom-scrollbar">
			{#if edits.currentImageId}
				<div class="mb-6 hidden lg:block"><EditorTools img={edits.currentImageId} currentTool="crop" /></div>
			{/if}
			{#if !hasCrop}
				<button type="button" onclick={startCrop} class="mb-3 w-full rounded-xl border border-neutral-500 bg-neutral-900 px-4 py-3 text-sm font-semibold text-neutral-100 hover:bg-neutral-800">Start crop</button>
			{/if}
			{#if edits.pp3?.Rotation}
				<div class="space-y-3 lg:space-y-8">
					<Slider
						label="Rotate"
						min={-45}
						max={45}
						step={0.1}
						centered
						resetValue={0}
						bind:value={edits.pp3.Rotation.Degree as number}
						onchange={(v) => {
							edits.pp3.Rotation.Degree = v;
							edits.pushHistory();
							requestAnimationFrame(() => draw());
						}}
					/>

					{#if imageInfo}
						<div class="hidden rounded-xl border border-neutral-800 bg-neutral-900/30 p-4 lg:block">
							<div class="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-500 mb-2">Original Resolution</div>
							<div class="text-sm font-medium text-neutral-300 tabular-nums">
								{imageInfo.resolutionX} × {imageInfo.resolutionY}
							</div>
						</div>
					{/if}
				</div>
			{/if}
		</div>

	</aside>
</div>
