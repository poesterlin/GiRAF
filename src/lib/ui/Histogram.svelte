<script lang="ts">
	import { calculateHistogram, type Histogram, type HistogramChannel } from '$lib/histogram';
	import { edits } from '$lib/state/editing.svelte';
	import Button from './Button.svelte';
	import { IconRestore, IconTrash } from './icons';
	import { curveDragSensitivity, curveSamples, identityPoints, moveCurvePoint, readToneCurve, writeToneCurve, type CurvePoint } from '$lib/tone-curve';

	let { src, pending = false }: { src: string; pending?: boolean } = $props();
	let histogram = $state<Histogram | null>(null);
	const points = $derived(readToneCurve(edits.pp3?.Exposure?.Curve2));
	let selected = $state(0);
	let graph: HTMLDivElement;
	const curvePath = $derived(points ? curveSamples(points).map((p, i) => `${i ? 'L' : 'M'}${p.x * 255},${(1 - p.y) * 100}`).join(' ') : '');
	let pointer: number | null = null;
	let lastPointTap: { index: number; time: number } | null = null;
	let suppressPointClick = false;
	function tapPoint(index: number) {
		if (suppressPointClick) {
			suppressPointClick = false;
			lastPointTap = null;
			return;
		}
		selected = index;
		const now = performance.now();
		if (lastPointTap?.index === index && now - lastPointTap.time < 300) {
			removePoint();
			lastPointTap = null;
		} else {
			lastPointTap = { index, time: now };
		}
	}
	let gesture: { x: number; y: number; point: CurvePoint; points: CurvePoint[]; index: number; width: number; height: number; dragging: boolean; sensitivity: number } | null = null;
	function commit(next: CurvePoint[], separate = false) {
		edits.pp3.Exposure.Curve2 = writeToneCurve(next);
		edits.pp3.Exposure.Enabled = true;
		edits.pushHistory(separate);
	}
	function startDrag(event: PointerEvent, index: number) {
		if (!points || pointer !== null || event.button !== 0) return;
		selected = index;
		suppressPointClick = false;
		const target = event.currentTarget as HTMLElement;
		target.focus({ preventScroll: true });
		pointer = event.pointerId;
		const rect = graph.getBoundingClientRect();
		gesture = { x: event.clientX, y: event.clientY, point: { ...points[index] }, points: points.map((p) => ({ ...p })), index, width: rect.width, height: rect.height, dragging: false, sensitivity: curveDragSensitivity(points[index]) };
		target.setPointerCapture(event.pointerId);
	}
	function drag(event: PointerEvent) {
		if (pointer !== event.pointerId || !gesture) return;
		const dx = event.clientX - gesture.x;
		const dy = event.clientY - gesture.y;
		if (!gesture.dragging) {
			if (Math.hypot(dx, dy) < 6) return;
			gesture.dragging = true;
			suppressPointClick = true;
			lastPointTap = null;
		}
		event.preventDefault();
		commit(moveCurvePoint(gesture.points, gesture.index, gesture.point.x + dx / gesture.width * gesture.sensitivity, gesture.point.y - dy / gesture.height * gesture.sensitivity));
	}
	function endDrag(event: PointerEvent) {
		if (pointer !== event.pointerId) return;
		pointer = null;
		gesture = null;
		const target = event.currentTarget as HTMLElement;
		if (target.hasPointerCapture(event.pointerId)) target.releasePointerCapture(event.pointerId);
	}
	function keyAdjust(event: KeyboardEvent, index: number) {
		if (!points) return;
		const step = (event.shiftKey ? 10 : 1) / 255;
		if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
		event.preventDefault();
		commit(moveCurvePoint(points, index, points[index].x + (event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0), points[index].y + (event.key === 'ArrowDown' ? -step : event.key === 'ArrowUp' ? step : 0)));
	}
	function addPoint(event: MouseEvent) {
		if (!points || event.target !== event.currentTarget) return;
		const rect = graph.getBoundingClientRect();
		const x = Math.max(0.002, Math.min(0.998, (event.clientX - rect.left) / rect.width));
		const y = x;
		const nearest = points.findIndex((p) => Math.abs(p.x - x) < 0.01);
		if (nearest >= 0) { selected = nearest; return; }
		const next = [...points, { x, y }].sort((a, b) => a.x - b.x);
		selected = next.findIndex((p) => p.x === x);
		commit(next, true);
	}
	function removePoint() {
		if (!points || selected <= 0 || selected >= points.length - 1) return;
		commit(points.filter((_, i) => i !== selected), true);
		selected = Math.max(0, selected - 1);
	}
	let loading = $state(false);
	const channels: HistogramChannel[] = ['red', 'green', 'blue'];
	const colors = { red: '#fb7185', green: '#4ade80', blue: '#60a5fa', luma: '#d4d4d8' };
	const scale = (n: number) => Math.log1p(n);
	const peak = $derived(histogram ? Math.max(1, ...channels.flatMap((channel) => histogram![channel].map(scale))) : 1);

	function area(channel: HistogramChannel) {
		if (!histogram) return '';
		return `M0,100 ${histogram[channel].map((count, index) => `L${index},${100 - scale(count) / peak * 94}`).join(' ')} L255,100 Z`;
	}

	$effect(() => {
		const url = src;
		const controller = new AbortController();
		if (!url) {
			histogram = null;
			return;
		}
		loading = true;
		async function update() {
			try {
				const response = await fetch(url, { signal: controller.signal });
				if (!response.ok) throw new Error('Preview unavailable');
				const bitmap = await createImageBitmap(await response.blob());
				try {
					if (controller.signal.aborted) return;
					const ratio = Math.min(1, 512 / Math.max(bitmap.width, bitmap.height));
					const canvas = document.createElement('canvas');
					canvas.width = Math.max(1, Math.round(bitmap.width * ratio));
					canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
					const context = canvas.getContext('2d', { willReadFrequently: true });
					if (!context) throw new Error('Canvas unavailable');
					context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
					histogram = calculateHistogram(context.getImageData(0, 0, canvas.width, canvas.height).data);
				} finally {
					bitmap.close();
				}
			} catch {
				if (!controller.signal.aborted) histogram = null;
			} finally {
				if (!controller.signal.aborted) loading = false;
			}
		}
		void update();
		return () => controller.abort();
	});
</script>

<section class="histogram min-w-0 py-1" aria-label="Tone curve histogram" aria-busy={loading || pending}>
	<div bind:this={graph} class="relative mx-3 mt-3 h-56 rounded-lg border border-neutral-800 bg-neutral-950">
		<svg viewBox="0 0 255 100" preserveAspectRatio="none" class="h-full w-full" aria-hidden="true">
			{#each [25, 50, 75] as y}<line x1="0" x2="255" y1={y} y2={y} stroke="#262626" stroke-width="0.5" />{/each}
			{#each [64, 128, 192] as x}<line x1={x} x2={x} y1="0" y2="100" stroke="#262626" stroke-width="0.5" />{/each}
			{#each channels as channel}<path d={area(channel)} fill={colors[channel]} fill-opacity="0.18" stroke={colors[channel]} stroke-opacity="0.6" stroke-width="0.75" vector-effect="non-scaling-stroke" style="mix-blend-mode: screen" />{/each}
			<line x1="0" x2="255" y1="100" y2="0" stroke="#525252" stroke-width="1" stroke-dasharray="4 4" vector-effect="non-scaling-stroke" />
			<path d={curvePath} fill="none" stroke="#0a0a0a" stroke-width="5" stroke-linecap="round" vector-effect="non-scaling-stroke" />
			<path d={curvePath} fill="none" stroke="#e5e5e5" stroke-width="2" stroke-linecap="round" vector-effect="non-scaling-stroke" />
		</svg>
		<button type="button" aria-label="Tap to add a tone curve point" disabled={!points} onclick={addPoint} class="absolute inset-0 h-full w-full rounded-lg focus-visible:outline-2 focus-visible:outline-white" style="touch-action: pan-y;"></button>
		{#if points}
			{#each points as point, index}
				<button type="button" aria-label={`Curve point ${index + 1}: input ${Math.round(point.x * 255)}, output ${Math.round(point.y * 255)}. Drag or use arrow keys to adjust.`} aria-pressed={selected === index} onclick={() => tapPoint(index)} onpointerdown={(event) => startDrag(event, index)} onpointermove={drag} onpointerup={endDrag} onpointercancel={endDrag} onlostpointercapture={() => { pointer = null; gesture = null; }} onkeydown={(event) => keyAdjust(event, index)} class="curve-point absolute flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-lg" style:left={`${point.x * 100}%`} style:top={`${(1 - point.y) * 100}%`} style="touch-action: none;" >
					<span class="h-3.5 w-3.5 rounded-full border-2 shadow-md transition-colors" class:bg-neutral-100={selected === index} class:border-neutral-950={selected === index} class:ring-2={selected === index} class:ring-neutral-400={selected === index} class:bg-neutral-900={selected !== index} class:border-neutral-300={selected !== index}></span>
				</button>
			{/each}
		{/if}
	</div>
	<div class="mt-3 grid grid-cols-2 gap-2">
		<Button class="min-h-11 justify-center text-xs" disabled={!points || selected === 0 || selected >= points.length - 1} onclick={removePoint}><IconTrash size={16} />Remove</Button>
		<Button class="min-h-11 justify-center text-xs" onclick={() => { selected = 0; commit(identityPoints(), true); }}><IconRestore size={16} />Reset</Button>
	</div>
</section>

<style>
	.curve-point { outline: none; }
	.curve-point:focus-visible > span { outline: 2px solid white; outline-offset: 5px; }
</style>
