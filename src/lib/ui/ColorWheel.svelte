<script lang="ts">
	let {
		label,
		hue,
		saturation,
		ignored = false,
		onchange
	}: {
		label: string;
		hue: number;
		saturation: number;
		ignored?: boolean;
		onchange: (hue: number) => void;
	} = $props();
	let pointer: number | undefined;
	const radians = $derived(((hue - 90) * Math.PI) / 180);
	function pick(event: PointerEvent) {
		const rect = event.currentTarget instanceof HTMLElement ? event.currentTarget.getBoundingClientRect() : undefined;
		if (!rect) return;
		const x = event.clientX - rect.left - rect.width / 2;
		const y = event.clientY - rect.top - rect.height / 2;
		if (Math.hypot(x, y) < rect.width * 0.18) return;
		onchange(Math.round(((Math.atan2(y, x) * 180) / Math.PI + 450) % 360));
	}
	function down(event: PointerEvent) {
		if (!event.isPrimary || event.button !== 0 || pointer !== undefined) return;
		event.preventDefault();
		pointer = event.pointerId;
		(event.currentTarget as HTMLElement).setPointerCapture(pointer);
		pick(event);
	}
	function finish(event: PointerEvent) {
		if (event.pointerId === pointer) pointer = undefined;
	}
	function key(event: KeyboardEvent) {
		let next = hue;
		if (['ArrowRight', 'ArrowUp'].includes(event.key)) next += event.shiftKey ? 10 : 1;
		else if (['ArrowLeft', 'ArrowDown'].includes(event.key)) next -= event.shiftKey ? 10 : 1;
		else if (event.key === 'Home') next = 0;
		else if (event.key === 'End') next = 359;
		else return;
		event.preventDefault();
		onchange((next + 360) % 360);
	}
</script>

<div class="relative flex items-center justify-center rounded-2xl border border-neutral-800 bg-neutral-900/40 p-4">
	<div
		role="slider"
		tabindex="0"
		aria-label={label}
		aria-valuemin={0}
		aria-valuemax={359}
		aria-valuenow={hue}
		aria-valuetext={`${hue} degrees`}
		aria-orientation="horizontal"
		class="wheel relative h-44 w-44 shrink-0 touch-none rounded-full outline-none select-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-4 focus-visible:ring-offset-neutral-950"
		class:opacity-50={ignored}
		onpointerdown={down}
		onpointermove={(event) => {
			if (event.pointerId === pointer) pick(event);
		}}
		onpointerup={finish}
		onpointercancel={finish}
		onlostpointercapture={finish}
		onkeydown={key}
	>
		<div class="pointer-events-none absolute inset-[23%] flex flex-col items-center justify-center gap-2 rounded-full border border-neutral-700 bg-neutral-950 shadow-inner">
			<span class="swatch relative h-8 w-8 overflow-hidden rounded-full ring-1 ring-white/20">
				<span class="absolute inset-0" style:background-color={`hsl(${hue} 100% 55%)`} style:opacity={saturation / 100}></span>
			</span>
		</div>
		<span
			class="pointer-events-none absolute flex h-11 w-11 items-center justify-center"
			style:left={`${50 + Math.cos(radians) * 38}%`}
			style:top={`${50 + Math.sin(radians) * 38}%`}
			style:transform="translate(-50%, -50%)"
		>
			<span class="h-6 w-6 rounded-full border-[3px] border-white shadow-[0_0_0_2px_#171717,0_2px_8px_#000]" style:background-color={`hsl(${hue} 100% 50%)`}></span>
		</span>
	</div>
	<span class="pointer-events-none absolute right-3 bottom-3 font-mono text-xs text-neutral-400">{hue}°</span>
</div>

<style>
	.wheel {
		background: conic-gradient(#f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00);
	}
	.swatch {
		background-color: #bdbdbd;
		background-image: conic-gradient(#666 25%, transparent 0 50%, #666 0 75%, transparent 0);
		background-size: 8px 8px;
	}
</style>
