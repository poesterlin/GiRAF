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
		const p = point(event);
		if (!p) return;
		const handle = (event.target as Element).closest('[data-spot]');
		if (handle && !adding) {
			selected = Number(handle.getAttribute('data-spot'));
			draft = spots.map((s) => ({ ...s }));
			drag = { index: selected, source: handle.getAttribute('data-source') === 'true', pointer: event.pointerId };
			svg?.setPointerCapture(event.pointerId);
		} else if (adding) {
			if (!target) target = p;
			else {
				const nextIndex = spots.length;
				commit([...spots, { x: target.x, y: target.y, sourceX: p.x, sourceY: p.y, radius, feather: 0.5, opacity: 1 }]);
				selected = nextIndex;
				target = undefined;
				adding = false;
			}
		}
	}
	function move(event: PointerEvent) {
		if (!drag || drag.pointer !== event.pointerId || !draft) return;
		const p = point(event);
		if (!p) return;
		if (drag.source) {
			draft[drag.index].sourceX = p.x;
			draft[drag.index].sourceY = p.y;
		} else {
			draft[drag.index].x = p.x;
			draft[drag.index].y = p.y;
		}
	}
	function end(event: PointerEvent) {
		if (!drag || drag.pointer !== event.pointerId) return;
		if (draft && event.type !== 'pointercancel') commit(draft);
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

<div class="flex h-full min-h-0 flex-col bg-neutral-950 text-neutral-200 lg:flex-row">
	<div class="relative min-h-0 flex-1 bg-black">
		{#if dimensions.width && dimensions.height}
			<svg
				bind:this={svg}
				viewBox={`0 0 ${dimensions.width} ${dimensions.height}`}
				class="h-full w-full touch-none"
				role="img"
				aria-label="Spot retouching: tap a blemish, then a clean source area"
				onpointerdown={down}
				onpointermove={move}
				onpointerup={end}
				onpointercancel={end}
			>
				{#if imageUrl}<image href={imageUrl} width={dimensions.width} height={dimensions.height} />{/if}
				{#if !showOriginal}
					{#each visible as spot, index}
						<g stroke={index === selected ? '#fff' : '#aaa'} stroke-width="2" fill="transparent">
							<circle data-spot={index} cx={spot.x} cy={spot.y} r={Math.max(spot.radius, hitRadius)} stroke="none" />
							<circle data-spot={index} data-source="true" cx={spot.sourceX} cy={spot.sourceY} r={Math.max(spot.radius, hitRadius)} stroke="none" />
							<line x1={spot.x} y1={spot.y} x2={spot.sourceX} y2={spot.sourceY} vector-effect="non-scaling-stroke" stroke-dasharray="4 4" />
							<circle data-spot={index} cx={spot.x} cy={spot.y} r={spot.radius} vector-effect="non-scaling-stroke" />
							<circle data-spot={index} data-source="true" cx={spot.sourceX} cy={spot.sourceY} r={spot.radius} stroke-dasharray="3 3" vector-effect="non-scaling-stroke" />
						</g>
					{/each}
					{#if target}<circle cx={target.x} cy={target.y} r={radius} fill="none" stroke="white" stroke-width="2" vector-effect="non-scaling-stroke" />{/if}
				{/if}
			</svg>
		{/if}
		{#if loading}<div class="pointer-events-none absolute left-3 top-3 rounded-full bg-black/70 px-3 py-1 text-xs" role="status">Updating preview…</div>{/if}
		{#if renderError}<p role="alert" class="absolute bottom-3 left-3 right-3 rounded-lg bg-black/80 p-3 text-sm">{renderError}</p>{/if}
	</div>
	<aside class="flex max-h-[50dvh] shrink-0 flex-col gap-2 overflow-y-auto border-t border-neutral-800 p-3 lg:max-h-full lg:w-80 lg:border-l lg:border-t-0 lg:p-5">
		<div class="flex items-center justify-between">
			<h1 class="font-semibold">Retouch</h1>
			<a href={editorLink} class="flex min-h-11 items-center px-3 text-sm">Done</a>
		</div>
		<p class="text-xs text-neutral-400">
			{adding ? (target ? 'Now tap a clean source area.' : 'Tap the spot you want to remove.') : 'Drag the solid target or dotted source circle.'} Crop, straightening and lens corrections
			are hidden for precise placement.
		</p>
		<div class="flex gap-2">
			<button
				class="tool flex-1"
				class:chosen={adding}
				onclick={() => {
					adding = !adding;
					target = undefined;
				}}>Add spot</button
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
		{#if spots.length}<select
				aria-label="Selected spot"
				class="min-h-11 rounded-lg bg-neutral-800 px-3"
				value={selected}
				onchange={(e) => {
					selected = Number(e.currentTarget.value);
					adding = false;
					target = undefined;
				}}
				><option value={-1}>Select spot ({spots.length})</option>{#each spots as _, i}<option value={i}>Spot {i + 1}</option>{/each}</select
			>{/if}
		<label class="control"
			>Size <input
				aria-label="Spot radius"
				type="range"
				min="2"
				max={data.maxRadius}
				step="1"
				value={active?.radius ?? radius}
				onchange={(e) => change('radius', Number(e.currentTarget.value))}
			/><span>{active?.radius ?? radius}px</span></label
		>
		{#if active}
			<label class="control"
				>Feather <input
					aria-label="Feather"
					type="range"
					min="0"
					max="1"
					step="0.05"
					value={active.feather}
					onchange={(e) => change('feather', Number(e.currentTarget.value))}
				/></label
			>
			<label class="control"
				>Opacity <input
					aria-label="Opacity"
					type="range"
					min="0"
					max="1"
					step="0.05"
					value={active.opacity}
					onchange={(e) => change('opacity', Number(e.currentTarget.value))}
				/></label
			>
		{/if}
		<div class="flex gap-2">
			<button
				class="tool flex-1"
				disabled={!active}
				onclick={() => {
					commit(spots.filter((_, i) => i !== selected));
					selected = -1;
				}}>Delete spot</button
			><button class="tool chosen flex-1" disabled={saving} onclick={save}
				>{#if saved}<IconCheck size={18} />{:else}<IconDeviceFloppy size={18} />{/if}{saving ? 'Saving…' : saved ? 'Saved' : 'Save'}</button
			>
		</div>
	</aside>
</div>

<style>
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
