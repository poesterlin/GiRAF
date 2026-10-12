<script lang="ts">
	import { beforeNavigate } from '$app/navigation';
	import { onDestroy, untrack } from 'svelte';
	import BasePP3 from '$lib/assets/client.pp3?raw';
	import { edits } from '$lib/state/editing.svelte';
	import { app } from '$lib/state/app.svelte';
	import { excludePP3, toBase64 } from '$lib/pp3-utils';
	import { readSpotRemoval, writeSpotRemoval } from '$lib/spot-removal';
	import { suggestSpotSource } from '$lib/spot-source';
	type Spot = { x: number; y: number; sourceX: number; sourceY: number; radius: number; feather: number; opacity: number };
	import Slider from '$lib/ui/Slider.svelte';
	import EditorToolPanel from '$lib/ui/EditorToolPanel.svelte';
	import EditorZoomControls from '$lib/ui/EditorZoomControls.svelte';
	import IconEye from '@tabler/icons-svelte/icons/eye';
	import IconTrash from '@tabler/icons-svelte/icons/trash';
	import IconPlus from '@tabler/icons-svelte/icons/plus';

	let { data } = $props();
	let svg = $state<SVGSVGElement>();
	let dimensions = $state({ width: 0, height: 0 });
	let selected = $state(-1);
	let adding = $state(true);
	let target = $state<{ x: number; y: number }>();
	let draft = $state<Spot[]>();
	let drag: { index: number; source: boolean; pointer: number } | undefined;
	let imageUrl = $state('');
	let loading = $state(false);
	let renderError = $state('');
	let showOriginal = $state(false);
	let loadedImageId: number | undefined;
	let radius = $state(40);
	let feather = $state(0.5);
	let hitRadius = $state(100);
	let zoom = $state(1);
	let center = $state({ x: 0, y: 0 });
	let detail = $state<{ x: number; y: number }>();
	let inspecting = $state(false);
	let loupeLeft = $state(false);
	let originalUrl = $state('');
	let originalPixels: ImageData | undefined;
	const originalConfig = $derived(
		toBase64(excludePP3(edits.throttledPP3 ?? {}, ['Spot_removal', 'Crop', 'Rotation', 'Perspective', 'Distortion', 'LensProfile', 'Common_Transform']))
	);
	function avoidFinger(event: PointerEvent) {
		const rect = svg?.getBoundingClientRect();
		if (!rect || event.clientY > rect.top + 140) return;
		if (event.clientX > rect.right - 140) loupeLeft = true;
		else if (event.clientX < rect.left + 140) loupeLeft = false;
	}
	let sizeValue = $state(40);
	let featherValue = $state(50);
	const view = $derived({
		// Leave half a viewport beyond each edge so corner spots can be centred.
		x: zoom === 1 ? 0 : Math.max(0, Math.min(dimensions.width, center.x)) - dimensions.width / zoom / 2,
		y: zoom === 1 ? 0 : Math.max(0, Math.min(dimensions.height, center.y)) - dimensions.height / zoom / 2,
		width: dimensions.width / zoom,
		height: dimensions.height / zoom
	});
	let gesture: { x: number; y: number; cx: number; cy: number; scale: number; moved: boolean; p?: { x: number; y: number }; pointer: number } | undefined;
	const pointers = new Map<number, { x: number; y: number }>();
	let pinch: { distance: number; zoom: number } | undefined;
	$effect(() => {
		sizeValue = active?.radius ?? radius;
		featherValue = (active?.feather ?? feather) * 100;
	});
	function focusAt(p: { x: number; y: number }, level = zoom) {
		center = { ...p };
		zoom = Math.max(1, Math.min(8, level));
	}
	function chooseSpot(index: number) {
		showOriginal = false;
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
	$effect(() => {
		if (!adding && !active) {
			if (spots.length) selected = Math.min(Math.max(selected, 0), spots.length - 1);
			else {
				adding = true;
			}
		}
		if (adding) {
			selected = -1;
		}
		if (!spots.length) showOriginal = false;
	});
	function addMode() {
		adding = true;
		selected = -1;
		target = undefined;
		showOriginal = false;
		detail = undefined;
	}
	$effect(() => {
		if (!svg || !dimensions.width) return;
		const observer = new ResizeObserver(() => {
			if (svg) hitRadius = 22 / Math.max(0.001, Math.min(svg.clientWidth / dimensions.width, svg.clientHeight / dimensions.height));
		});
		observer.observe(svg);
		return () => observer.disconnect();
	});

	$effect(() => {
		const image = data.image;
		const pp3 = data.snapshots[0]?.pp3 ?? data.image.importBaseline ?? BasePP3;
		untrack(() => {
			edits.initialize(pp3, image);
			if (loadedImageId === image.id) return;
			loadedImageId = image.id;
			if (imageUrl) URL.revokeObjectURL(imageUrl);
			imageUrl = '';
			radius = Math.min(radius, data.maxRadius);
			selected = -1;
			target = undefined;
			zoom = 1;
			center = { x: 0, y: 0 };
			pointers.clear();
			pinch = undefined;
			gesture = undefined;
			drag = undefined;
			draft = undefined;
			adding = true;
			showOriginal = false;
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
		if (imageUrl) URL.revokeObjectURL(imageUrl);
		if (originalUrl) URL.revokeObjectURL(originalUrl);
	});
	$effect(() => {
		const config = originalConfig;
		originalPixels = undefined;
		const id = data.image.id;
		const controller = new AbortController();
		const timer = setTimeout(async () => {
			try {
				const response = await fetch(`/api/images/${id}/edit?config=${encodeURIComponent(config)}`, { signal: controller.signal });
				if (!response.ok) return;
				const blob = await response.blob();
				if (controller.signal.aborted) return;
				if (originalUrl) URL.revokeObjectURL(originalUrl);
				originalUrl = URL.createObjectURL(blob);
				const bitmap = await createImageBitmap(blob);
				try {
					if (controller.signal.aborted) return;
					const canvas = document.createElement('canvas');
					canvas.width = bitmap.width; canvas.height = bitmap.height;
					const context = canvas.getContext('2d', { willReadFrequently: true });
					if (context) { context.drawImage(bitmap,0,0); originalPixels = context.getImageData(0,0,canvas.width,canvas.height); }
				} finally { bitmap.close(); }
			} catch (error) {
				if (!controller.signal.aborted) console.error('Could not load spot thumbnails', error);
			}
		}, 200);
		return () => {
			clearTimeout(timer);
			controller.abort();
		};
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
			inspecting = false;
			const [a, b] = [...pointers.values()];
			pinch = { distance: Math.hypot(a.x - b.x, a.y - b.y), zoom };
			gesture = undefined;
			drag = undefined;
			draft = undefined;
			return;
		}
		const p = point(event);
		inspecting = !!p;
		if (p) detail = p;
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
		if (pointers.has(event.pointerId)) {
			event.preventDefault();
			avoidFinger(event);
		}
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
			if (gesture.moved) inspecting = false;
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
		inspecting = false;
		pointers.delete(event.pointerId);
		if (pinch) {
			if (!pointers.size) pinch = undefined;
			gesture = undefined;
			return;
		}
		if (gesture?.pointer === event.pointerId && gesture.p && !gesture.moved && event.type !== 'pointercancel' && adding) {
			const p = gesture.p;
			if (!target) {
				target = p;
				detail = p;
				focusAt(p, 3);
				if (originalPixels) {
					const sx=originalPixels.width/dimensions.width, sy=originalPixels.height/dimensions.height;
					const source = suggestSpotSource(originalPixels, {x:p.x*sx,y:p.y*sy}, radius*Math.min(sx,sy), feather, spots.flatMap(s => [{x:s.x*sx,y:s.y*sy,radius:s.radius*(1+s.feather)*Math.max(sx,sy)}, {x:s.sourceX*sx,y:s.sourceY*sy,radius:s.radius*(1+s.feather)*Math.max(sx,sy)}]));
					if (source) {
						const index=spots.length;
						commit([...spots,{x:p.x,y:p.y,sourceX:Math.round(source.x/sx),sourceY:Math.round(source.y/sy),radius,feather,opacity:1}]);
						selected=index; target=undefined; adding=false;
					}
				}
			} else {
				const nextIndex = spots.length;
				commit([...spots, { x: target.x, y: target.y, sourceX: p.x, sourceY: p.y, radius, feather, opacity: 1 }]);
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
		if (key === 'feather') feather = value;
		if (active) commit(spots.map((s, i) => (i === selected ? { ...s, [key]: value } : s)));
	}
</script>

{#snippet pointBadge(x: number, y: number)}
	<g transform={`translate(${x} ${y}) scale(${hitRadius / zoom / 22})`} pointer-events="none" role="img" aria-label="Copy source" opacity="0.65">
		<title>Copy source</title>
		<g stroke="#a5d6dd" stroke-width="1.25" fill="none">
			<rect x="-3" y="-3" width="9" height="9" rx="1.5"/><path d="M2-6h-7a1 1 0 0 0-1 1v7"/>
		</g>
	</g>
{/snippet}

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
							<line class:source-flow={index === selected} x1={spot.sourceX} y1={spot.sourceY} x2={spot.x} y2={spot.y} vector-effect="non-scaling-stroke" stroke-dasharray="4 4" pointer-events="none" />
							{#if index === selected && spot.feather > 0}
								<circle
									cx={spot.x}
									cy={spot.y}
									r={spot.radius * (1 + spot.feather)}
									stroke-opacity="0.5"
									stroke-dasharray="2 4"
									vector-effect="non-scaling-stroke"
									pointer-events="none"
								/>
								<circle
									cx={spot.sourceX}
									stroke="#67e8f9"
									cy={spot.sourceY}
									r={spot.radius * (1 + spot.feather)}
									stroke-opacity="0.5"
									stroke-dasharray="2 4"
									vector-effect="non-scaling-stroke"
									pointer-events="none"
								/>
							{/if}
							<circle data-spot={index} cx={spot.x} cy={spot.y} r={spot.radius} vector-effect="non-scaling-stroke" />
							<circle data-spot={index} data-source="true" cx={spot.sourceX} cy={spot.sourceY} r={spot.radius} stroke={index === selected ? '#67e8f9' : '#aaa'} stroke-dasharray="3 3" vector-effect="non-scaling-stroke" />
							{#if index === selected}
								{@const labelSize = hitRadius / zoom * 0.5}
								{@render pointBadge(spot.sourceX, spot.sourceY+spot.radius+labelSize*1.5)}
							{/if}
						</g>
					{/each}
					{#if target}<circle cx={target.x} cy={target.y} r={radius} fill="none" stroke="white" stroke-width="2" vector-effect="non-scaling-stroke" />
						{#if feather > 0}<circle
								cx={target.x}
								cy={target.y}
								r={radius * (1 + feather)}
								fill="none"
								stroke="white"
								stroke-opacity="0.5"
								stroke-dasharray="2 4"
								vector-effect="non-scaling-stroke"
								pointer-events="none"
							/>{/if}
					{/if}
				{/if}
			</svg>
		{/if}
		{#if imageUrl && detail && inspecting}
			<div
				class="pointer-events-none absolute top-3 h-24 w-24 overflow-hidden rounded-2xl border border-white/30 bg-black shadow-xl"
				class:left-3={loupeLeft}
				class:right-3={!loupeLeft}
				aria-label="Magnified spot preview"
			>
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
		<EditorZoomControls {zoom} onzoomout={() => focusAt({ x: view.x + view.width / 2, y: view.y + view.height / 2 }, zoom / 1.5)} onzoomin={() => focusAt(target ?? active ?? { x: dimensions.width / 2, y: dimensions.height / 2 }, zoom * 1.5)} onfit={() => (zoom = 1)}>
			{#if spots.length}
				<span class="mx-1 hidden h-5 w-px bg-neutral-700 lg:block" aria-hidden="true"></span>
				<button class="min-h-11 rounded-full px-3 text-xs font-medium" aria-pressed={showOriginal} onclick={() => (showOriginal = !showOriginal)}><IconEye size={20} /><span>Before</span></button>
			{/if}
		</EditorZoomControls>
		{#if loading}<div class="pointer-events-none absolute left-3 top-3 rounded-full bg-black/70 px-3 py-1 text-xs" role="status">Updating preview…</div>{/if}
		{#if renderError}<p role="alert" class="absolute bottom-3 left-3 right-3 rounded-lg bg-black/80 p-3 text-sm">{renderError}</p>{/if}
	</div>
	<EditorToolPanel img={String(data.image.id)} tool="retouch" onundo={() => { edits.undo(); target = undefined; adding = false; showOriginal = false; }} onredo={() => { edits.redo(); target = undefined; adding = false; showOriginal = false; }}>
		<div class="flex items-center gap-1 rounded-2xl bg-neutral-900/70 p-1" aria-label="Spot selection">
			<button class="tool shrink-0" class:chosen={adding} aria-label="Add spot" aria-pressed={adding} onclick={addMode}><IconPlus size={18} /></button>
			<div class="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto p-1" aria-label="Spots">
				{#each spots as spot, i}<button
						class="icon-tool relative shrink-0 overflow-hidden rounded-full text-xs"
						class:chosen={!adding && selected === i}
						class:ring-2={!adding && selected === i}
						class:ring-white={!adding && selected === i}
						aria-label={`Select spot ${i + 1}`}
						aria-pressed={!adding && selected === i}
						title={`Spot ${i + 1} · original area`}
						onclick={() => chooseSpot(i)}
					>
						{#if !adding && selected === i && originalUrl}
							{@const extent = Math.min(dimensions.width / 2, dimensions.height / 2, Math.max(12, spot.radius * (1 + spot.feather) * 1.3))}
							<svg class="absolute inset-0 h-full w-full bg-black" viewBox={`${Math.max(0,Math.min(dimensions.width-extent*2,spot.x-extent))} ${Math.max(0,Math.min(dimensions.height-extent*2,spot.y-extent))} ${extent * 2} ${extent * 2}`} aria-hidden="true"
								><image href={originalUrl} width={dimensions.width} height={dimensions.height} /></svg
							>
						{:else}{i + 1}{/if}
					</button>{/each}
			</div>
			{#if target}<button class="tool text-xs" onclick={addMode}>Cancel source</button>{/if}
			{#if active && !adding}<button
					class="icon-tool"
					aria-label="Delete selected spot"
					onclick={() => {
						commit(spots.filter((_, i) => i !== selected));
						target = undefined;
					}}><IconTrash size={18} /></button
				>{/if}
		</div>
		{#if !showOriginal && (active || adding)}
			<div class="grid grid-cols-2 gap-2">
				<Slider
					label="Size"
					bind:value={sizeValue}
					min={1}
					max={data.maxRadius}
					step={1}
					precision={0}
					unit="px"
					resetValue={Math.min(40, data.maxRadius)}
					onchange={(value) => change('radius', value)}
				/>
				<Slider label="Feather" bind:value={featherValue} min={0} max={100} step={1} precision={0} unit="%" resetValue={50} onchange={(value) => change('feather', value / 100)} />
			</div>
		{/if}
	</EditorToolPanel>
</div>

<style>
	.source-flow { animation: source-flow 1.2s linear infinite; }
	@keyframes source-flow { to { stroke-dashoffset: -8; } }
	@media (prefers-reduced-motion: reduce) { .source-flow { animation: none; } }
	.retouch-workspace,
	.retouch-workspace :global(*) {
		-webkit-user-select: none;
		user-select: none;
		-webkit-touch-callout: none;
	}
	.icon-tool {
		display: flex;
		align-items: center;
		justify-content: center;
		min-width: 44px;
		min-height: 44px;
		border-radius: 9999px;
	}
	.icon-tool:hover { background: #262626; }
	button:focus-visible, a:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
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
