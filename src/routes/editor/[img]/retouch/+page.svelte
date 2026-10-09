<script lang="ts">
	import { beforeNavigate } from '$app/navigation';
	import { page } from '$app/state';
	import { onDestroy, untrack } from 'svelte';
	import BasePP3 from '$lib/assets/client.pp3?raw';
	import { edits } from '$lib/state/editing.svelte';
	import { app } from '$lib/state/app.svelte';
	import { excludePP3, toBase64 } from '$lib/pp3-utils';
	import { readSpotRemoval, writeSpotRemoval } from '$lib/spot-removal';
	type Spot = { x: number; y: number; sourceX: number; sourceY: number; radius: number; feather: number; opacity: number };
	import { IconArrowBackUp, IconArrowForwardUp, IconCheck, IconDeviceFloppy } from '$lib/ui/icons';
	import Slider from '$lib/ui/Slider.svelte';
	import IconTrash from '@tabler/icons-svelte/icons/trash';
	import IconPlus from '@tabler/icons-svelte/icons/plus';
	import IconMinus from '@tabler/icons-svelte/icons/minus';
	import IconMaximize from '@tabler/icons-svelte/icons/maximize';

	let { data } = $props();
	let svg = $state<SVGSVGElement>();
	let dimensions = $state({ width: 0, height: 0 });
	let selected = $state(-1);
	let adding = $state(true);
	let target = $state<{ x: number; y: number }>();
	let draft = $state<Spot[]>();
	let drag: { index: number; source: boolean; pointer: number } | undefined;
	let saving = $state(false);
	let saved = $state(false);
	let imageUrl = $state('');
	let loading = $state(false);
	let renderError = $state('');
	let showOriginal = $state(false);
	let alive = true;
	let radius = $state(40);
	let hitRadius = $state(100);
	let zoom = $state(1);
	let center = $state({ x: 0, y: 0 });
	let detail = $state<{ x: number; y: number }>();
	let loupeLeft = $state(false);
	let setting = $state<'radius' | 'feather'>('radius');
	function avoidFinger(event: PointerEvent) {
		const rect = svg?.getBoundingClientRect();
		if (!rect || event.clientY > rect.top + 140) return;
		if (event.clientX > rect.right - 140) loupeLeft = true;
		else if (event.clientX < rect.left + 140) loupeLeft = false;
	}
	let sliderValue = $state(40);
	const view = $derived({
		x: Math.max(0, Math.min(dimensions.width - dimensions.width / zoom, center.x - dimensions.width / zoom / 2)),
		y: Math.max(0, Math.min(dimensions.height - dimensions.height / zoom, center.y - dimensions.height / zoom / 2)),
		width: dimensions.width / zoom,
		height: dimensions.height / zoom
	});
	let gesture: { x: number; y: number; cx: number; cy: number; scale: number; moved: boolean; p: { x: number; y: number }; pointer: number } | undefined;
	const pointers = new Map<number, { x: number; y: number }>();
	let pinch: { distance: number; zoom: number } | undefined;
	$effect(() => {
		sliderValue = setting === 'radius' ? (active?.radius ?? radius) : (active?.[setting] ?? (setting === 'feather' ? 0.5 : 1)) * 100;
	});
	function focusAt(p: { x: number; y: number }, level = zoom) {
		center = { ...p };
		zoom = Math.max(1, Math.min(8, level));
	}
	function chooseSpot(index: number) {
		selected = index;
		adding = false;
		target = undefined;
		if (spots[index]) {
			focusAt(spots[index], 3);
			detail = spots[index];
		}
	}
	const spots = $derived(
		readSpotRemoval(edits.pp3 ?? {}).entries.map((s) => ({
			x: s.target.x,
			y: s.target.y,
			sourceX: s.source.x,
			sourceY: s.source.y,
			radius: s.radius,
			feather: s.feather,
			opacity: s.opacity
		}))
	);
	const visible = $derived(draft ?? spots);
	const active = $derived(visible[selected]);
	const editorLink = $derived(`/editor/${data.image.id}${page.url.search}`);
	$effect(() => {
		if (!svg || !dimensions.width) return;
		const observer = new ResizeObserver(() => {
			hitRadius = 22 / (svg?.getScreenCTM()?.a ?? 1);
		});
		observer.observe(svg);
		return () => observer.disconnect();
	});

	$effect(() => {
		const image = data.image;
		const pp3 = data.snapshots[0]?.pp3 ?? BasePP3;
		untrack(() => {
			edits.initialize(pp3, image);
			radius = Math.min(radius, data.maxRadius);
			selected = -1;
			target = undefined;
		});
	});
	$effect(() => {
		const rotated = Math.abs(Number(edits.pp3.Coarse_Transformation?.Rotate ?? 0)) % 180 === 90;
		dimensions = rotated ? { width: data.dimensions.height, height: data.dimensions.width } : data.dimensions;
	});
	$effect(() => {
		const pp3 = excludePP3(edits.throttledPP3, ['Crop', 'Rotation', 'Perspective', 'Distortion', 'LensProfile', 'Common_Transform']);
		if (showOriginal) delete pp3.Spot_removal;
		const config = toBase64(pp3);
		const id = data.image.id;
		const controller = new AbortController();
		loading = true;
		const timer = setTimeout(async () => {
			try {
				const response = await fetch(`/api/images/${id}/edit?config=${encodeURIComponent(config)}`, { signal: controller.signal });
				if (!response.ok) throw new Error('Could not render retouch preview');
				const blob = await response.blob();
				if (controller.signal.aborted) return;
				const next = URL.createObjectURL(blob);
				if (imageUrl) URL.revokeObjectURL(imageUrl);
				imageUrl = next;
				renderError = '';
			} catch (error) {
				if (!controller.signal.aborted) renderError = String(error);
			} finally {
				if (!controller.signal.aborted) loading = false;
			}
		}, 200);
		return () => {
			clearTimeout(timer);
			controller.abort();
		};
	});
	onDestroy(() => {
		alive = false;
		if (imageUrl) URL.revokeObjectURL(imageUrl);
	});
	beforeNavigate(() => {
		if (edits.hasChanges) void edits.snapshot().catch((error) => app.addToast(String(error), 'error'));
	});

	function commit(next: Spot[]) {
		edits.pp3 = writeSpotRemoval(edits.pp3, {
			enabled: true,
			entries: next.map((s) => ({ source: { x: s.sourceX, y: s.sourceY }, target: { x: s.x, y: s.y }, radius: s.radius, feather: s.feather, opacity: s.opacity }))
		});
		edits.pushHistory(true);
		saved = false;
	}
	function point(event: PointerEvent) {
		const matrix = svg?.getScreenCTM();
		if (!matrix) return;
		const p = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
		if (!drag && (p.x < 0 || p.y < 0 || p.x >= dimensions.width || p.y >= dimensions.height)) return;
		return { x: Math.round(Math.max(0, Math.min(dimensions.width - 1, p.x))), y: Math.round(Math.max(0, Math.min(dimensions.height - 1, p.y))) };
	}
	function down(event: PointerEvent) {
		if (!dimensions.width || !imageUrl || showOriginal || event.button !== 0) return;
		event.preventDefault();
		avoidFinger(event);
		pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
		svg?.setPointerCapture(event.pointerId);
		if (pointers.size === 2) {
			const [a, b] = [...pointers.values()];
			pinch = { distance: Math.hypot(a.x - b.x, a.y - b.y), zoom };
			gesture = undefined;
			drag = undefined;
			draft = undefined;
			return;
		}
		const p = point(event);
		if (!p) return;
		const handle = (event.target as Element).closest('[data-spot]');
		if (handle && !adding) {
			selected = Number(handle.getAttribute('data-spot'));
			draft = spots.map((s) => ({ ...s }));
			drag = { index: selected, source: handle.getAttribute('data-source') === 'true', pointer: event.pointerId };
			svg?.setPointerCapture(event.pointerId);
		} else {
			gesture = {
				x: event.clientX,
				y: event.clientY,
				cx: view.x + view.width / 2,
				cy: view.y + view.height / 2,
				scale: svg?.getScreenCTM()?.a ?? 1,
				moved: false,
				p,
				pointer: event.pointerId
			};
		}
	}
	function move(event: PointerEvent) {
		if (pointers.has(event.pointerId)) { event.preventDefault(); avoidFinger(event); }
		if (pointers.has(event.pointerId)) pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
		if (pinch && pointers.size === 2) {
			const [a, b] = [...pointers.values()];
			zoom = Math.max(1, Math.min(8, (pinch.zoom * Math.hypot(a.x - b.x, a.y - b.y)) / Math.max(1, pinch.distance)));
			return;
		}
		if (gesture && gesture.pointer === event.pointerId) {
			const dx = event.clientX - gesture.x,
				dy = event.clientY - gesture.y;
			if (Math.hypot(dx, dy) > 6) gesture.moved = true;
			if (gesture.moved) center = { x: gesture.cx - dx / gesture.scale, y: gesture.cy - dy / gesture.scale };
			return;
		}
		if (!drag || drag.pointer !== event.pointerId || !draft) return;
		const p = point(event);
		if (!p) return;
		detail = p;
		if (drag.source) {
			draft[drag.index].sourceX = p.x;
			draft[drag.index].sourceY = p.y;
		} else {
			draft[drag.index].x = p.x;
			draft[drag.index].y = p.y;
		}
	}
	function end(event: PointerEvent) {
		pointers.delete(event.pointerId);
		if (pinch) {
			if (!pointers.size) pinch = undefined;
			gesture = undefined;
			return;
		}
		if (gesture?.pointer === event.pointerId && !gesture.moved && event.type !== 'pointercancel' && adding) {
			const p = gesture.p;
			if (!target) {
				target = p;
				detail = p;
				focusAt(p, 3);
			} else {
				const nextIndex = spots.length;
				commit([...spots, { x: target.x, y: target.y, sourceX: p.x, sourceY: p.y, radius, feather: 0.5, opacity: 1 }]);
				selected = nextIndex;
				detail = target;
				target = undefined;
				adding = false;
			}
		}
		gesture = undefined;
		if (drag?.pointer === event.pointerId && draft && event.type !== 'pointercancel') commit(draft);
		drag = undefined;
		draft = undefined;
		if (svg?.hasPointerCapture(event.pointerId)) svg.releasePointerCapture(event.pointerId);
	}
	function change(key: 'radius' | 'feather' | 'opacity', value: number) {
		if (!Number.isFinite(value)) return;
		if (key === 'radius') radius = value;
		if (active) commit(spots.map((s, i) => (i === selected ? { ...s, [key]: value } : s)));
	}
	async function save() {
		if (saving) return;
		saving = true;
		try {
			await edits.snapshot();
			if (alive) saved = true;
		} catch (error) {
			app.addToast(String(error), 'error');
		} finally {
			if (alive) saving = false;
		}
	}
</script>

<div class="retouch-workspace flex h-full min-h-0 select-none flex-col bg-neutral-950 text-neutral-200 lg:flex-row">
	<div class="relative min-h-0 flex-1 bg-black">
		{#if dimensions.width && dimensions.height}
			<svg
				bind:this={svg}
				viewBox={`${view.x} ${view.y} ${view.width} ${view.height}`}
				class="h-full w-full touch-none"
				role="img"
				aria-label="Spot retouching: tap a blemish, then a clean source area"
				onpointerdown={down}
				onpointermove={move}
				onpointerup={end}
				onpointercancel={end}
				onwheel={(event) => {
					event.preventDefault();
					focusAt({ x: view.x + view.width / 2, y: view.y + view.height / 2 }, zoom * (event.deltaY < 0 ? 1.2 : 1 / 1.2));
				}}
			>
				{#if imageUrl}<image href={imageUrl} width={dimensions.width} height={dimensions.height} />{/if}
				{#if !showOriginal}
					{#each visible as spot, index}
						<g stroke={index === selected ? '#fff' : '#aaa'} stroke-width="2" fill="transparent">
							<circle data-spot={index} cx={spot.x} cy={spot.y} r={Math.max(spot.radius, hitRadius / zoom)} stroke="none" />
							<circle data-spot={index} data-source="true" cx={spot.sourceX} cy={spot.sourceY} r={Math.max(spot.radius, hitRadius / zoom)} stroke="none" />
							<line x1={spot.x} y1={spot.y} x2={spot.sourceX} y2={spot.sourceY} vector-effect="non-scaling-stroke" stroke-dasharray="4 4" />
							{#if index === selected && spot.feather > 0}
								<circle cx={spot.x} cy={spot.y} r={spot.radius * (1 + spot.feather)} stroke-opacity="0.5" stroke-dasharray="2 4" vector-effect="non-scaling-stroke" pointer-events="none" />
								<circle cx={spot.sourceX} cy={spot.sourceY} r={spot.radius * (1 + spot.feather)} stroke-opacity="0.5" stroke-dasharray="2 4" vector-effect="non-scaling-stroke" pointer-events="none" />
							{/if}
							<circle data-spot={index} cx={spot.x} cy={spot.y} r={spot.radius} vector-effect="non-scaling-stroke" />
							<circle data-spot={index} data-source="true" cx={spot.sourceX} cy={spot.sourceY} r={spot.radius} stroke-dasharray="3 3" vector-effect="non-scaling-stroke" />
						</g>
					{/each}
					{#if target}<circle cx={target.x} cy={target.y} r={radius} fill="none" stroke="white" stroke-width="2" vector-effect="non-scaling-stroke" />{/if}
				{/if}
			</svg>
		{/if}
		{#if imageUrl && detail && zoom > 1}
			<div class="pointer-events-none absolute top-3 h-24 w-24 overflow-hidden rounded-2xl border border-white/30 bg-black shadow-xl" class:left-3={loupeLeft} class:right-3={!loupeLeft} aria-label="Magnified spot preview">
				<svg viewBox={`${detail.x - 35} ${detail.y - 35} 70 70`} class="h-full w-full"
					><image href={imageUrl} width={dimensions.width} height={dimensions.height} /><circle
						cx={detail.x}
						cy={detail.y}
						r="2"
						fill="none"
						stroke="white"
						stroke-width="0.6"
					/></svg
				>
			</div>
		{/if}
		<div class="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center rounded-full border border-neutral-700 bg-black/80 p-1 shadow-xl">
			<button class="icon-tool" aria-label="Zoom out" disabled={zoom === 1} onclick={() => focusAt({ x: view.x + view.width / 2, y: view.y + view.height / 2 }, zoom / 1.5)}
				><IconMinus size={18} /></button
			>
			<span class="min-w-10 text-center text-xs tabular-nums">{zoom.toFixed(1)}×</span>
			<button
				class="icon-tool"
				aria-label="Zoom in"
				disabled={zoom === 8}
				onclick={() => focusAt(target ?? active ?? { x: dimensions.width / 2, y: dimensions.height / 2 }, zoom * 1.5)}><IconPlus size={18} /></button
			>
			<div class="hidden lg:block"><button class="icon-tool" aria-label="Fit photo" onclick={() => (zoom = 1)}><IconMaximize size={18} /></button></div>
		</div>
		{#if loading}<div class="pointer-events-none absolute left-3 top-3 rounded-full bg-black/70 px-3 py-1 text-xs" role="status">Updating preview…</div>{/if}
		{#if renderError}<p role="alert" class="absolute bottom-3 left-3 right-3 rounded-lg bg-black/80 p-3 text-sm">{renderError}</p>{/if}
	</div>
	<aside class="flex max-h-[50dvh] shrink-0 flex-col gap-2 overflow-y-auto border-t border-neutral-800 p-3 lg:max-h-full lg:w-80 lg:border-l lg:border-t-0 lg:p-5">
		<div class="flex items-center justify-between">
			<h1 class="font-semibold">Retouch</h1>
			<a href={editorLink} class="flex min-h-11 items-center px-3 text-sm">Done</a>
		</div>
		<p class="text-xs text-neutral-400" aria-live="polite">
			{adding ? (target ? '2 · Tap a clean source. Drag to pan.' : '1 · Tap the blemish to zoom in.') : 'Drag either circle · pinch to zoom'}
		</p>
		<div class="flex gap-2">
			<button
				class="tool flex-1"
				class:chosen={adding}
				onclick={() => {
					adding = !target;
					target = undefined;
					selected = -1;
					setting = 'radius';
					zoom = 1;
				}}
			>
				<IconPlus size={18} /> {target ? 'Cancel' : 'Spot'}</button
			>
			<button
				class="tool"
				disabled={!edits.canUndo}
				aria-label="Undo"
				onclick={() => {
					edits.undo();
					target = undefined;
					selected = -1;
				}}><IconArrowBackUp size={20} /></button
			>
			<button
				class="tool"
				disabled={!edits.canRedo}
				aria-label="Redo"
				onclick={() => {
					edits.redo();
					selected = -1;
				}}><IconArrowForwardUp size={20} /></button
			>
			<button class="tool" aria-pressed={showOriginal} onclick={() => (showOriginal = !showOriginal)}>Before</button>
		</div>
		<div class="flex items-center gap-1">
			{#each ['radius', 'feather'] as key}<button
					class="min-h-11 flex-1 rounded-lg px-2 text-xs font-medium"
					class:bg-neutral-800={setting === key}
					disabled={!active && key !== 'radius'}
					onclick={() => (setting = key as typeof setting)}>{key === 'radius' ? `Size · ${active?.radius ?? radius}px` : `Feather · ${Math.round((active?.feather ?? 0.5) * 100)}%`}</button
				>{/each}
		</div>
		{#key setting}<Slider
				label={setting === 'radius' ? 'Size' : 'Feather'}
				bind:value={sliderValue}
				min={setting === 'radius' ? 1 : 0}
				max={setting === 'radius' ? data.maxRadius : 100}
				step={1}
				precision={0}
				unit={setting === 'radius' ? 'px' : '%'}
				resetValue={setting === 'radius' ? Math.min(40, data.maxRadius) : setting === 'feather' ? 50 : 100}
				onchange={(value) => change(setting, setting === 'radius' ? value : value / 100)}
			/>{/key}
		<div class="flex gap-2">
			<div class="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto" aria-label="Spots">
				{#each spots as _, i}<button
						class="icon-tool shrink-0 rounded-full text-xs"
						class:chosen={selected === i}
						aria-label={`Select spot ${i + 1}`}
						aria-pressed={selected === i}
						onclick={() => chooseSpot(i)}>{i + 1}</button
					>{/each}
			</div>
			<button
				class="tool"
				aria-label="Delete selected spot"
				disabled={!active}
				onclick={() => {
					commit(spots.filter((_, i) => i !== selected));
					selected = -1;
				}}><IconTrash size={18} /></button
			><button class="tool chosen" disabled={saving} onclick={save}
				>{#if saved}<IconCheck size={18} />{:else}<IconDeviceFloppy size={18} />{/if}{saving ? 'Saving…' : saved ? 'Saved' : 'Save'}</button
			>
		</div>
	</aside>
</div>

<style>
	.retouch-workspace, .retouch-workspace :global(*) { -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; }
	.icon-tool {
		display: flex;
		align-items: center;
		justify-content: center;
		min-width: 44px;
		min-height: 44px;
	}
	button:disabled {
		opacity: 0.3;
	}
	.tool {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 6px;
		min-height: 44px;
		min-width: 44px;
		padding: 8px 12px;
		border-radius: 10px;
		background: #262626;
		font-size: 14px;
	}
	.tool:disabled {
		opacity: 0.3;
	}
	.chosen {
		background: #eee;
		color: #111;
	}
	.control {
		display: flex;
		align-items: center;
		gap: 8px;
		min-height: 36px;
		font-size: 12px;
	}
	.control input {
		min-width: 0;
		flex: 1;
		accent-color: white;
	}
</style>
