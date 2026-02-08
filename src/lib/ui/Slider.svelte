<script lang="ts">
	import { clamp } from '$lib';
	import { onMount } from 'svelte';

	interface Props {
		label: string;
		value: number;
		min?: number;
		max?: number;
		step?: number;
		centered?: boolean;
		unit?: string;
		onchange?: (value: number) => void;
		ignored?: boolean;
		overlay?: string;
		map?: (n: number) => number;
		inverseMap?: (n: number) => number;
		precision?: number;
		resetValue?: number;
	}

	let {
		label,
		value = $bindable(0),
		min = -100,
		max = 100,
		step = 1,
		centered,
		unit = '',
		onchange = () => {},
		ignored,
		overlay,
		resetValue,
		precision = 3,
		map = (n) => n,
		inverseMap = (n) => n
	}: Props = $props();

	let wrapperRef: HTMLDivElement;
	let sliderRef: HTMLInputElement;

	let isDragging = $state(false);
	let isDragPending = $state(false);
	let isFocused = $state(false);
	let lastX = 0;
	let startX = 0;
	let startY = 0;
	let trackWidth = 0;
	const DRAG_SLOP_PX = 8;

	// Double-tap detection (time + distance threshold)
	let lastTapTime = 0;
	let lastTapX = 0;
	let lastTapY = 0;
	const DOUBLE_TAP_MS = 280;
	const DOUBLE_TAP_SLOP_PX = 24;

	const linearValue = $derived(inverseMap(value));

	const quantize = (v: number) => {
		const n = Math.round((v - min) / step) * step + min;
		return Number(n.toFixed(6));
	};

	// UPDATED: Calculate percentage from the linear value for correct visuals
	const pct = $derived.by(() => {
		if (max === min) return 0;
		const p = ((linearValue - min) / (max - min)) * 100;
		return Math.max(0, Math.min(100, p));
	});

	const centerPct = $derived.by(() => {
		if (max === min) return 50;
		return ((0 - min) / (max - min)) * 100;
	});

	const fillLeftPct = $derived.by(() => (centered ? Math.min(pct, centerPct) : 0));
	const fillWidthPct = $derived.by(() => (centered ? Math.abs(pct - centerPct) : pct));

	const handleDoubleClick = () => {
		if (centered) {
			const centerVal = (max + min) / 2;
			value = resetValue ?? map(quantize(centerVal));
		} else {
			value = resetValue ?? map(quantize(min));
		}

		onchange?.(value);
	};

	const handleInput = (e: Event) => {
		const target = e.target as HTMLInputElement;
		let nextLinear = Number(target.value);
		// The native input with a `step` attribute handles its own quantization,
		// but we re-quantize for consistency.
		nextLinear = quantize(clamp(nextLinear, min, max));
		const next = map(nextLinear);
		if (next !== value) {
			value = next;
			onchange?.(value);
		}
	};

	function maybeHandleDoubleTap(e: PointerEvent) {
		const now = performance.now();
		const x = e.clientX;
		const y = e.clientY;

		const dt = now - lastTapTime;
		const dx = x - lastTapX;
		const dy = y - lastTapY;
		const dist2 = dx * dx + dy * dy;

		if (dt > 0 && dt < DOUBLE_TAP_MS && dist2 < DOUBLE_TAP_SLOP_PX * DOUBLE_TAP_SLOP_PX) {
			lastTapTime = 0;
			handleDoubleClick();
			return true;
		}

		lastTapTime = now;
		lastTapX = x;
		lastTapY = y;
		return false;
	}

	function handlePointerDown(e: PointerEvent) {
		if (e.pointerType !== 'mouse' && maybeHandleDoubleTap(e)) {
			return;
		}

		startX = e.clientX;
		startY = e.clientY;
		lastX = e.clientX;
		trackWidth = wrapperRef.clientWidth || 1;

		if (e.pointerType === 'mouse') {
			isDragging = true;
			try {
				wrapperRef.setPointerCapture(e.pointerId);
			} catch {
				/* ignore if not supported */
			}
		} else {
			isDragPending = true;
		}
	}

	// UPDATED: Perform drag calculations in the linear domain
	function handlePointerMove(e: PointerEvent) {
		if (!isDragging) {
			if (!isDragPending) return;
			const dx = e.clientX - startX;
			const dy = e.clientY - startY;
			const absX = Math.abs(dx);
			const absY = Math.abs(dy);

			if (absX > DRAG_SLOP_PX && absX > absY) {
				isDragPending = false;
				isDragging = true;
				lastX = e.clientX;
				try {
					wrapperRef.setPointerCapture(e.pointerId);
				} catch {
					/* ignore if not supported */
				}
			} else if (absY > DRAG_SLOP_PX && absY > absX) {
				isDragPending = false;
				return;
			} else {
				return;
			}
		}

		e.preventDefault();
		const dx = e.clientX - lastX;
		lastX = e.clientX;

		const linearRange = max - min || 1;
		const linearDelta = (dx / trackWidth) * linearRange;

		// Convert current value to linear, add delta, then re-map
		const currentLinear = inverseMap(value);
		let nextLinear = currentLinear + linearDelta;

		// Clamp and quantize in the linear domain
		nextLinear = quantize(clamp(nextLinear, min, max));

		const next = map(nextLinear);

		if (next !== value) {
			value = next;
			onchange?.(value);
		}
	}

	function handlePointerUp(e: PointerEvent) {
		if (!isDragging) {
			isDragPending = false;
			return;
		}
		isDragging = false;
		isDragPending = false;
		try {
			wrapperRef.releasePointerCapture(e.pointerId);
		} catch {
			/* ignore */
		}
	}

	function handleFocusIn() {
		isFocused = true;
	}
	function handleFocusOut() {
		isFocused = false;
	}

	function formatNumber(n: number) {
		if (precision === 0) {
			return Math.round(n).toString();
		}

		const abs = Math.abs(n);
		let logPrecision = Math.max(0, Math.min(5, 2 - Math.floor(Math.log10(abs))));
		return n.toFixed(logPrecision).replace(/\.0+$/, '');
	}

	onMount(() => {
		const handleContextMenu = (event: MouseEvent) => {
			if (wrapperRef && event.target instanceof Node && wrapperRef.contains(event.target)) {
				event.preventDefault();
			}
		};

		document.addEventListener('contextmenu', handleContextMenu, true);
		return () => document.removeEventListener('contextmenu', handleContextMenu, true);
	});
</script>

<!-- Container -->
<div class="w-full" class:opacity-70={ignored}>
	<!-- Tall relative slider wrapper -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		bind:this={wrapperRef}
		class="
      relative h-14 w-full cursor-grab touch-pan-y rounded-md
      select-none active:cursor-grabbing no-touch-callout
    "
		oncontextmenu={(e) => e.preventDefault()}
		onpointerdown={handlePointerDown}
		onpointermove={handlePointerMove}
		onpointerup={handlePointerUp}
		onpointercancel={handlePointerUp}
		ondblclick={handleDoubleClick}
	>
		{#if overlay}
			<div class="{overlay} absolute inset-0 z-10 touch-none rounded-md opacity-50 mix-blend-hard-light" class:saturate-0={ignored}></div>
		{/if}

		<!-- Track background + ring -->
		<div
			class="
        absolute inset-0 overflow-hidden rounded-md
        bg-neutral-900/90 ring-neutral-700
        transition-colors
      "
			class:ring-1={!ignored}
		></div>

		<!-- Focus/drag visual ring overlay -->
		<div
			class="
        pointer-events-none absolute inset-0 rounded-md
        ring-2 ring-neutral-200/80 transition-opacity
      "
			class:opacity-0={!isFocused && !isDragging}
		></div>

		<!-- Center mark (only in centered mode) -->
		{#if centered}
			<div
				class="
          pointer-events-none absolute top-1/2 left-1/2 h-8 w-px
          -translate-x-1/2 -translate-y-1/2
          bg-neutral-500/60
        "
			></div>
		{/if}

		<!-- Fill (light grayscale so text inverts over it) -->
		<div
			class="
        absolute top-0 bottom-0 bg-gradient-to-r
        from-neutral-300 to-neutral-100
      "
			style={`left:${fillLeftPct}%;width:${fillWidthPct}%;`}
			class:transition-[width,left]={!isDragging}
			class:duration-100={!isDragging}
			class:ease-linear={!isDragging}
			class:rounded-md={!centered}
			class:rounded-r-md={fillLeftPct === 50}
			class:rounded-l-md={fillLeftPct < 50}
			class:from-neutral-200={ignored}
			class:to-neutral-300={ignored}
		></div>

		<!-- In-track text (white + difference => invert over fill) -->
		<div
			class="
        pointer-events-none absolute inset-0 flex items-center
        justify-between px-4 text-xs text-white
        mix-blend-difference sm:text-sm
      "
		>
			<span class="font-medium">{label}</span>
			<span class="tabular-nums">{formatNumber(value)}{unit}</span>
		</div>

		<input
			bind:this={sliderRef}
			type="range"
			{min}
			{max}
			{step}
			value={linearValue}
			aria-label={label}
			oninput={handleInput}
			onchange={() => onchange(value)}
			onfocusin={handleFocusIn}
			onfocusout={handleFocusOut}
			class="pointer-events-none absolute inset-0 opacity-0 no-touch-callout"
			oncontextmenu={(e) => e.preventDefault()}
		/>
	</div>
</div>

<style>
	.saturate-0 {
		filter: saturate(0);
	}
	.no-touch-callout {
		-webkit-touch-callout: none;
	}
</style>
