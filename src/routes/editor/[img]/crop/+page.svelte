<script lang="ts">
	import { page } from '$app/state';
	import { assert } from '$lib';
	import { checkHandleCollision, drawCropGrid, moveHandle } from '$lib/canvas/grid';
	import ImportPP3 from '$lib/assets/import.pp3?raw';
	import { excludePP3, parsePP3, stringifyPP3, toBase64, type PP3 } from '$lib/pp3-utils';
	import { edits } from '$lib/state/editing.svelte';
	import Button from '$lib/ui/Button.svelte';
	import EditModeNav from '$lib/ui/EditModeNav.svelte';
	import { IconCheck, IconDeviceFloppy } from '$lib/ui/icons';

	let canvasEl = $state<HTMLCanvasElement>();
	let imgEl = $state<HTMLImageElement>();

	let imageDimensions = { width: 0, height: 0 };
	let displayDimensions = { width: 0, height: 0 };
	let displayScale = 1;
	const padding = 24;

	let ctx = $derived.by(() => {
		if (!canvasEl) {
			return null;
		}

		const context = canvasEl?.getContext('2d');
		assert(context, 'Failed to get canvas context');
		return context;
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

		displayScale = Math.min(1, maxWidth / imageDimensions.width, maxHeight / imageDimensions.height);
		displayDimensions = {
			width: Math.round(imageDimensions.width * displayScale),
			height: Math.round(imageDimensions.height * displayScale)
		};
	}

	function getScaledPP3() {
		if (!edits.pp3?.Crop) {
			return null;
		}

		const crop = edits.pp3.Crop;
		return {
			...edits.pp3,
			Crop: {
				...crop,
				X: crop.X * displayScale,
				Y: crop.Y * displayScale,
				W: crop.W * displayScale,
				H: crop.H * displayScale
			}
		} as PP3<number>;
	}

	function draw() {
		if (!canvasEl || !imgEl || !ctx) {
			return;
		}

		updateDimensions();
		if (!displayScale) {
			return;
		}

		canvasEl.width = displayDimensions.width + padding * 2;
		canvasEl.height = displayDimensions.height + padding * 2;

		// clear canvas
		ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
		ctx.fillStyle = '#000';
		ctx.fillRect(0, 0, canvasEl.width, canvasEl.height);

		// draw image
		ctx.drawImage(imgEl, padding, padding, displayDimensions.width, displayDimensions.height);

		// draw crop grid
		const scaledPP3 = getScaledPP3();
		if (!scaledPP3) {
			return;
		}

		drawCropGrid(ctx, scaledPP3, { padding, selected: handle });
	}

	let isMoving = false;
	let handle: string | undefined = undefined;
	let lastX = 0;
	let lastY = 0;
	let moveCursor = $state(false);
	let snapshotSaved = $state(false);
	let flashKey = $state<string | null>(null);
	let flashTimer: number | null = null;
	let imageInfo = $state<{ resolutionX: number; resolutionY: number } | null>(null);

	const importPP3 = parsePP3(ImportPP3);

	function getPreviewDimensions(width: number, height: number) {
		const resize = importPP3.Resize as { Enabled?: boolean; LongEdge?: number; Width?: number; Height?: number } | undefined;

		if (!resize?.Enabled) {
			return { width, height };
		}

		const longEdge = Number.isFinite(resize.LongEdge) ? Number(resize.LongEdge) : 0;
		if (longEdge > 0) {
			const scale = longEdge / Math.max(width, height);
			return { width: Math.round(width * scale), height: Math.round(height * scale) };
		}

		const previewWidth = Number.isFinite(resize.Width) ? Number(resize.Width) : width;
		const previewHeight = Number.isFinite(resize.Height) ? Number(resize.Height) : height;
		return { width: Math.round(previewWidth), height: Math.round(previewHeight) };
	}

	function sanitizeCrop() {
		if (!edits.pp3?.Crop) {
			return;
		}

		const crop = edits.pp3.Crop as unknown as Record<string, number>;
		const width = Math.max(1, imageDimensions.width);
		const height = Math.max(1, imageDimensions.height);

		const toNumber = (value: unknown, fallback = 0) =>
			Number.isFinite(Number(value)) ? Number(value) : fallback;

		crop.X = toNumber(crop.X, 0);
		crop.Y = toNumber(crop.Y, 0);
		crop.W = toNumber(crop.W, 0);
		crop.H = toNumber(crop.H, 0);

		// normalize negative sizes
		if (crop.W < 0) {
			crop.X += crop.W;
			crop.W = -crop.W;
		}
		if (crop.H < 0) {
			crop.Y += crop.H;
			crop.H = -crop.H;
		}

		// clamp to image bounds and round to integers
		crop.X = Math.max(0, Math.min(Math.round(crop.X), width - 1));
		crop.Y = Math.max(0, Math.min(Math.round(crop.Y), height - 1));
		crop.W = Math.max(20, Math.min(Math.round(crop.W), width - crop.X));
		crop.H = Math.max(20, Math.min(Math.round(crop.H), height - crop.Y));
	}

	async function snapshot() {
		sanitizeCrop();
		edits.lastSavedPP3 = structuredClone($state.snapshot(edits.pp3));

		const res = await fetch(`/api/images/${page.params.img}/snapshots`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ pp3: stringifyPP3($state.snapshot(edits.pp3)) })
		});

		if (res.ok) {
			snapshotSaved = true;
		} else {
			alert('Failed to save snapshot.');
		}

		setTimeout(() => {
			snapshotSaved = false;
		}, 2000);
	}

	$effect(() => {
		const id = page.params.img;
		if (!id) {
			return;
		}
		fetch(`/api/images/${id}/details`)
			.then((res) => (res.ok ? res.json() : null))
			.then((data) => {
				imageInfo = data ? { resolutionX: data.resolutionX, resolutionY: data.resolutionY } : null;
			})
			.catch(() => {
				imageInfo = null;
			});
	});

	function move(event: PointerEvent) {
		if (!canvasEl || !ctx) {
			return;
		}

		const rect = canvasEl.getBoundingClientRect();
		const x = event.clientX - padding - rect.left;
		const y = event.clientY - padding - rect.top;
		const dx = x - lastX;
		const dy = y - lastY;
		lastX = x;
		lastY = y;

		if (!edits.pp3?.Crop || !displayScale) {
			return;
		}

		const scaledPP3 = getScaledPP3();
		if (!scaledPP3) {
			return;
		}

		moveCursor = !!checkHandleCollision(scaledPP3, x, y, 48);

		if (!isMoving || !handle) {
			return;
		}

		const dxImage = dx / displayScale;
		const dyImage = dy / displayScale;
		moveHandle(edits.pp3 as PP3<number>, handle, dxImage, dyImage, imageDimensions);

		requestAnimationFrame(() => draw());
	}

	function startMove(event: PointerEvent) {
		if (!displayScale) {
			updateDimensions();
		}

		if (!displayScale) {
			return;
		}

		const rect = canvasEl!.getBoundingClientRect();
		const x = event.clientX - padding - rect.left;
		const y = event.clientY - padding - rect.top;
		const imageX = x / displayScale;
		const imageY = y / displayScale;
		lastX = x;
		lastY = y;

		if (!edits.pp3.Crop) {
			edits.pp3.Crop = {
				Enabled: true,
				X: Math.max(0, Math.min(imageX, imageDimensions.width - 1)),
				Y: Math.max(0, Math.min(imageY, imageDimensions.height - 1)),
				W: 24,
				H: 24,
				FixedRatio: false,
				Ratio: '1:1'
			};

			handle = 'se';
			isMoving = true;
			moveCursor = true;
			canvasEl?.setPointerCapture(event.pointerId);
			return;
		}

		const scaledPP3 = getScaledPP3();
		handle = scaledPP3 ? checkHandleCollision(scaledPP3, x, y, 48) : undefined;
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

		sanitizeCrop();
		edits.pp3 = structuredClone($state.snapshot(edits.pp3));

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
					flashKey = null;
				}
			}, 220);
			snapshot();
		}
	}
</script>

<svelte:window onkeydown={handleKeyDown} onpointerup={endMove} />

<img src="/api/images/{page.params.img}/edit?config={toBase64(excludePP3(edits.pp3, ['Crop']))}" alt="" class="hidden" bind:this={imgEl} onload={draw} />

<div class="relative flex h-full w-full items-center justify-center">
	<canvas bind:this={canvasEl} onpointerdown={startMove} onpointermove={move} class:cursor-move={moveCursor} class="m-auto"></canvas>
	<EditModeNav showEdit img={page.params.img!} />
	<div class="absolute bottom-4 right-4">
		<Button onclick={snapshot} flash={flashKey === 's'}>
			<span>Save Crop</span>
			{#if snapshotSaved}
				<IconCheck />
			{:else}
				<IconDeviceFloppy />
			{/if}
		</Button>
		<div class="mt-2 max-w-[18rem] rounded-md border border-neutral-800/60 bg-neutral-950/70 p-2 text-xs text-neutral-300">
			{#if imageInfo}
				<div>RAW: {imageInfo.resolutionX} × {imageInfo.resolutionY}</div>
				{@const preview = getPreviewDimensions(imageInfo.resolutionX, imageInfo.resolutionY)}
				<div>Preview TIFF: {preview.width} × {preview.height}</div>
			{:else}
				<div>RAW: —</div>
				<div>Preview TIFF: —</div>
			{/if}
			{#if edits.pp3?.Crop}
				<div>Crop: X {edits.pp3.Crop.X} Y {edits.pp3.Crop.Y} W {edits.pp3.Crop.W} H {edits.pp3.Crop.H}</div>
			{:else}
				<div>Crop: —</div>
			{/if}
			<div class="text-neutral-400">Export uses full-resolution crop coordinates.</div>
		</div>
	</div>
</div>
