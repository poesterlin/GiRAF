<script lang="ts">
	import { assert } from '$lib';
	import { checkHandleCollision, drawCropGrid, moveHandle } from '$lib/canvas/grid';
	import { excludePP3, toBase64, type PP3 } from '$lib/pp3-utils';
	import { edits } from '$lib/state/editing.svelte';

	let canvasEl = $state<HTMLCanvasElement>();
	let imgEl = $state<HTMLImageElement>();

	const imgDimensions = { width: 800, height: 600 };
	const padding = 24;

	let ctx = $derived.by(() => {
		if (!canvasEl) {
			return null;
		}

		const context = canvasEl?.getContext('2d');
		assert(context, 'Failed to get canvas context');
		return context;
	});

	function draw() {
		if (!canvasEl || !imgEl || !ctx) {
			return;
		}

		canvasEl.width = imgDimensions.width + padding * 2;
		canvasEl.height = imgDimensions.height + padding * 2;

		// clear canvas
		ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
		ctx.fillStyle = '#000';
		ctx.fillRect(0, 0, canvasEl.width, canvasEl.height);

		// draw image
		ctx.drawImage(imgEl, padding, padding, imgDimensions.width, imgDimensions.height);

		// draw crop grid
		if (!edits.pp3.Crop) {
			return;
		}

		drawCropGrid(ctx, edits.pp3 as PP3<number>, { padding, selected: handle });
	}

	let isMoving = false;
	let handle: string | undefined = undefined;
	let lastX = 0;
	let lastY = 0;
	let moveCursor = $state(false);

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

		if (!edits.pp3.Crop) {
			return;
		}

		moveCursor = !!checkHandleCollision(edits.pp3 as PP3<number>, x, y, 48);

		if (!isMoving || !handle) {
			return;
		}

		moveHandle(edits.pp3 as PP3<number>, handle, dx, dy, imgDimensions);

		requestAnimationFrame(() => draw());
	}

	function startMove(event: PointerEvent) {
        const rect = canvasEl!.getBoundingClientRect();
		const x = event.clientX - padding - rect.left;
		const y = event.clientY - padding - rect.top;
		lastX = x;
		lastY = y;

		if (!edits.pp3.Crop) {
			edits.pp3.Crop = {
                Enabled: true,
				X: x,
				Y: y,
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

		handle = checkHandleCollision(edits.pp3 as PP3<number>, x, y, 48);
		if (handle && canvasEl) {
			isMoving = true;
			moveCursor = true;
			canvasEl.setPointerCapture(event.pointerId);
		} else {
			isMoving = false;
		}
	}

	function endMove(event: PointerEvent) {
		isMoving = false;
		handle = undefined;

		canvasEl!.releasePointerCapture(event.pointerId);
		moveCursor = false;

		requestAnimationFrame(() => draw());
	}
</script>

<svelte:window onpointerup={endMove} />

<img src="/edit?config={toBase64(excludePP3(edits.pp3, ['Crop']))}" alt="" class="hidden" bind:this={imgEl} onload={draw} />

<div class="flex h-full w-full items-center justify-center">
    <canvas bind:this={canvasEl} onpointerdown={startMove} onpointermove={move} class:cursor-move={moveCursor} class="m-auto"></canvas>
</div>
