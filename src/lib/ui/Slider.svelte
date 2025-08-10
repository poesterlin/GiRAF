<script lang="ts">
	interface Props {
		label: string;
		value: number;
		min?: number;
		max?: number;
		step?: number;
		centered?: boolean;
		unit?: string;
		onchange?: (value: number) => void;
	}

	let {
		label,
		value = $bindable(0),
		min = -100,
		max = 100,
		step = 1,
		centered = false,
		unit = '',
		onchange = () => {}
	}: Props = $props();

	let wrapperRef: HTMLDivElement;
	let sliderRef: HTMLInputElement;

	let isDragging = $state(false);
	let isFocused = $state(false);
	let lastX = 0;
	let trackWidth = 0;

	// Double-tap detection (time + distance threshold)
	let lastTapTime = 0;
	let lastTapX = 0;
	let lastTapY = 0;
	const DOUBLE_TAP_MS = 280;
	const DOUBLE_TAP_SLOP_PX = 24;

	const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

	const quantize = (v: number) => {
		const n = Math.round((v - min) / step) * step + min;
		return Number(n.toFixed(6));
	};

	const pct = $derived.by(() => {
		if (max === min) return 0;
		const p = ((value - min) / (max - min)) * 100;
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
			value = quantize(0);
			onchange?.(value);
		}
	};

	const handleInput = (e: Event) => {
		const target = e.target as HTMLInputElement;
		let next = Number(target.value);
		next = quantize(clamp(next, min, max));
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
			// double-tap detected: reset and don't start drag
			lastTapTime = 0;
			handleDoubleClick();
			return true;
		}

		// record tap for potential next tap
		lastTapTime = now;
		lastTapX = x;
		lastTapY = y;
		return false;
	}

	function handlePointerDown(e: PointerEvent) {
		// For touch/pen, detect double-tap and bail out if it's a reset
		if (e.pointerType !== 'mouse' && maybeHandleDoubleTap(e)) {
			return;
		}

		// Start relative drag (track delta, independent of initial pointer)
		isDragging = true;
		try {
			wrapperRef.setPointerCapture(e.pointerId);
		} catch {
			/* ignore if not supported */
		}
		trackWidth = wrapperRef.clientWidth || 1;
		lastX = e.clientX;
	}

	function handlePointerMove(e: PointerEvent) {
		if (!isDragging) return;
		e.preventDefault();
		const dx = e.clientX - lastX;
		lastX = e.clientX;

		const range = max - min || 1;
		let next = value + (dx / trackWidth) * range;
		next = quantize(clamp(next, min, max));

		if (next !== value) {
			value = next;
			onchange?.(value);
		}
	}

	function handlePointerUp(e: PointerEvent) {
		if (!isDragging) return;
		isDragging = false;
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

	function preventDefault(fn: (e: PointerEvent) => void) {
		return (e: PointerEvent) => {
			e.preventDefault();
			fn(e);
		};
	}
</script>

<!-- Container -->
<div class="w-full">
	<!-- Tall relative slider wrapper -->
	<div
		bind:this={wrapperRef}
		class="
      relative h-14 w-full cursor-grab touch-none rounded-md
      select-none active:cursor-grabbing
    "
		onpointerdown={preventDefault(handlePointerDown)}
		onpointermove={handlePointerMove}
		onpointerup={handlePointerUp}
		onpointercancel={handlePointerUp}
		ondblclick={handleDoubleClick}
	>
		<!-- Track background + ring -->
		<div
			class="
        absolute inset-0 overflow-hidden rounded-md
        bg-neutral-900/90 ring-1 ring-neutral-700
        transition-colors
      "
		></div>

		<!-- Focus/drag visual ring overlay -->
		<div
			class="
        pointer-events-none absolute inset-0 rounded-md
        ring-2 ring-neutral-500/60 transition-opacity
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
            class:rounded-r-md={fillLeftPct  === 50}
            class:rounded-l-md={fillLeftPct < 50}
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
			<span class="tabular-nums">{value}{unit}</span>
		</div>

		<!-- Native range input for keyboard & SR -->
		<input
			bind:this={sliderRef}
			type="range"
			{min}
			{max}
			{step}
			bind:value
			aria-label={label}
			oninput={handleInput}
			onfocusin={handleFocusIn}
			onfocusout={handleFocusOut}
			class="pointer-events-none absolute inset-0 opacity-0"
		/>
	</div>
</div>
