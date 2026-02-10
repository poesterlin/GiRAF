<script lang="ts">
	import { assert } from '$lib';
	import BasePP3 from '$lib/assets/client.pp3?raw';
	import { beforeNavigate, invalidateAll } from '$app/navigation';
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
	import { excludePP3, parsePP3, toBase64, type PP3 } from '$lib/pp3-utils';
	import { edits } from '$lib/state/editing.svelte';
	import Button from '$lib/ui/Button.svelte';
	import EditModeNav from '$lib/ui/EditModeNav.svelte';
	import { IconCheck, IconDeviceFloppy, IconRestore } from '$lib/ui/icons';
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
	let handle: string | undefined = undefined;
	let lastX = 0;
	let lastY = 0;
	let apiPath = $derived(`/api/images/${data.image.id}`);
	let imageUrl = $derived(apiPath + `/edit?preview&config=${toBase64(excludePP3(edits.throttledPP3, ['Crop', 'Rotation']))}`);

	// TODO: Configure autosave behavior in settings
	beforeNavigate(() => {
		if(edits.hasChanges) {
			edits.snapshot();
		}
	});

	$effect(() => {
		const latestSnapshot = data.snapshots[0];
		if (latestSnapshot) {
			edits.initialize(latestSnapshot.pp3, data.image);
		} else {
			edits.initialize(parsePP3(BasePP3), data.image);
		}
	});

	$effect(() => {
		fetch(apiPath + '/details')
			.then((res) => (res.ok ? res.json() : null))
			.then((data) => {
				imageInfo = data ? { resolutionX: data.resolutionX, resolutionY: data.resolutionY } : undefined;
			})
			.catch(() => {
				imageInfo = undefined;
			});
	});

	let moveCursor = $state(false);
	let snapshotSaved = $state(false);
	let resetSaved = $state(false);
	let flashKey = $state<string>();
	let flashTimer: number | null = null;
	let imageInfo = $state<{ resolutionX: number; resolutionY: number }>();

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

	async function snapshot() {
		await edits.snapshot()
		snapshotSaved = true;

		setTimeout(() => {
			snapshotSaved = false;
		}, 2000);
	}

	async function reset() {
		if (edits.hasChanges) {
			await edits.snapshot();
		}

		const base = parsePP3(BasePP3);
		if (edits.pp3) {
			edits.pp3.Crop = base.Crop;
			edits.pp3.Rotation = base.Rotation;
			edits.pushHistory();
		}

		await edits.snapshot();
		resetSaved = true;
		await invalidateAll();

		setTimeout(() => {
			resetSaved = false;
		}, 2000);
		
		requestAnimationFrame(() => draw());
	}

	function move(event: PointerEvent) {
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

		moveCursor = !!checkHandleCollision(scaledPP3, cropPoint.x * displayScale, cropPoint.y * displayScale, 48);

		if (!isMoving || !handle) {
			return;
		}

		moveHandle(edits.pp3 as PP3<number>, handle, dx, dy, imageDimensions);

		requestAnimationFrame(() => draw());
	}

	function startMove(event: PointerEvent) {
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
			moveCursor = true;
			canvasEl?.setPointerCapture(event.pointerId);
			return;
		}

		const scaledPP3 = getScaledPP3();
		handle = scaledPP3
			? checkHandleCollision(scaledPP3, cropPoint.x * displayScale, cropPoint.y * displayScale, 48)
			: undefined;
		if (handle && canvasEl) {
			isMoving = true;
			moveCursor = true;
			canvasEl.setPointerCapture(event.pointerId);
		} else {
			isMoving = false;
		}
	}

	function endMove(event: PointerEvent) {
		if (!canvasEl) {
			return;
		}
		
		isMoving = false;
		handle = undefined;

		canvasEl.releasePointerCapture(event.pointerId);
		moveCursor = false;

		if (edits.pp3?.Crop) {
			sanitizeCrop(edits.pp3.Crop as unknown as { X: number; Y: number; W: number; H: number }, imageDimensions, imageDimensions);
		}
		edits.pp3 = structuredClone($state.snapshot(edits.pp3));
		edits.pushHistory();

		requestAnimationFrame(() => draw());
	}

	function handleKeyDown(event: KeyboardEvent) {
		const target = event.target as HTMLElement | null;
		if (event.repeat) {
			return;
		}
		if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)) {
			return;
		}
		const normalizedKey = event.key.length === 1 ? event.key.toLowerCase() : event.key;
		if (normalizedKey === 's') {
			event.preventDefault();
			flashKey = normalizedKey;
			if (flashTimer) {
				clearTimeout(flashTimer);
			}
			flashTimer = window.setTimeout(() => {
				if (flashKey === normalizedKey) {
					flashKey = undefined;
				}
			}, 220);
			snapshot();
		}
		if (normalizedKey === 'r') {
			event.preventDefault();
			reset();
		}
	}

</script>

<svelte:window onkeydown={handleKeyDown} onpointerup={endMove} />

<img src={imageUrl} alt="" class="hidden" bind:this={imgEl} onload={draw} />

<div class="flex h-full flex-col overflow-hidden bg-neutral-950 text-neutral-200 lg:flex-row">
	<!-- Image Preview Section -->
	<div class="relative flex-1 overflow-hidden bg-neutral-900 shadow-inner">
		<div class="flex h-full items-center justify-center p-2 sm:p-2">
			<canvas bind:this={canvasEl} onpointerdown={startMove} onpointermove={move} class:cursor-move={moveCursor} class="m-auto"></canvas>
		</div>
		
		<!-- Desktop Left Nav -->
		<div class="absolute inset-y-0 left-4 hidden lg:flex flex-col justify-center pointer-events-none">
			<div class="pointer-events-auto">
				{#if edits.currentImageId}
					<EditModeNav showEdit img={edits.currentImageId} />
				{/if}
			</div>
		</div>

		<!-- Mobile Bottom Nav -->
		<div class="absolute bottom-4 left-0 right-0 flex justify-center lg:hidden pointer-events-none">
			<div class="pointer-events-auto">
				{#if edits.currentImageId}
					<EditModeNav showEdit img={edits.currentImageId} />
				{/if}
			</div>
		</div>
	</div>

	<!-- Controls Panel Section -->
	<aside
		class="flex w-full flex-col border-t border-neutral-800 bg-neutral-950 lg:h-full lg:w-[380px] lg:border-t-0 lg:border-l h-[35vh] lg:h-auto"
	>
		<!-- Panel Header -->
		<div class="flex items-center justify-between border-b border-neutral-800 px-6 py-3 lg:py-4">
			<div class="flex items-center gap-3">
				<div class="h-2 w-2 rounded-full bg-neutral-500"></div>
				<h2 class="text-xs font-bold tracking-widest uppercase text-neutral-400">Crop & Rotate</h2>
			</div>
		</div>

		<!-- Scrollable Controls -->
		<div class="flex-1 overflow-y-auto px-4 py-6 lg:px-6 custom-scrollbar">
			{#if edits.pp3?.Rotation}
				<div class="space-y-8">
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
						<div class="rounded-xl border border-neutral-800 bg-neutral-900/30 p-4">
							<div class="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-500 mb-2">Original Resolution</div>
							<div class="text-sm font-medium text-neutral-300 tabular-nums">
								{imageInfo.resolutionX} × {imageInfo.resolutionY}
							</div>
						</div>
					{/if}
				</div>
			{/if}
		</div>

		<!-- Actions Footer -->
		<div class="border-t border-neutral-800 bg-neutral-900/50 p-4 lg:p-6 backdrop-blur-sm">
			<div class="grid grid-cols-2 gap-3">
				<Button onclick={reset} flash={flashKey === 'r'} class="justify-center">
					<span>Reset</span>
					{#if resetSaved}
						<IconCheck size={18} />
					{:else}
						<IconRestore size={18} />
					{/if}
				</Button>

				<Button onclick={snapshot} flash={flashKey === 's'} class="w-full justify-center bg-neutral-100 hover:bg-neutral-200 border-none py-2.5">
					<span>Save Crop</span>
					{#if snapshotSaved}
						<IconCheck size={18} />
					{:else}
						<div class="relative">
							<IconDeviceFloppy size={16} />
							{#if edits.hasChanges}
								<span class="absolute -top-0.5 -right-0.5 block h-1.5 w-1.5 rounded-full bg-neutral-800"></span>
							{/if}
						</div>
					{/if}
				</Button>
			</div>
		</div>
	</aside>
</div>
