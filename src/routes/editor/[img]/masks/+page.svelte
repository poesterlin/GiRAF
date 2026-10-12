<script lang="ts">
	import { untrack } from 'svelte';
	import { beforeNavigate } from '$app/navigation';
	import BasePP3 from '$lib/assets/client.pp3?raw';
	import { edits } from '$lib/state/editing.svelte';
	import { excludePP3, toBase64 } from '$lib/pp3-utils';
	import { maskIndices, maskSize, setMaskSize } from '$lib/local-masks';
	import LocalMasks from '$lib/ui/LocalMasks.svelte';
	import EditorToolPanel from '$lib/ui/EditorToolPanel.svelte';
	import EditorZoomControls from '$lib/ui/EditorZoomControls.svelte';
	import IconEye from '@tabler/icons-svelte/icons/eye';
	let { data } = $props();
	let showOverlay = $state(true);
	let compare = $state(false);
	let aspect = $state(1.5);
	let imageArea = $state<HTMLDivElement>();
	let viewportWidth = $state(0);
	let viewportHeight = $state(0);
	const displayWidth = $derived(Math.min(viewportWidth, viewportHeight * aspect));
	let zoom = $state(1);
	let pan = $state({ x: 0, y: 0 });
	const pointers = new Map<number, { x: number; y: number }>();
	let tapStart: { id: number; x: number; y: number; time: number } | undefined;
	let lastTap: { x: number; y: number; time: number; type: string } | undefined;
	let gesture: { x: number; y: number; panX: number; panY: number } | undefined;
	let pinch: { distance: number; zoom: number; x: number; y: number; panX: number; panY: number } | undefined;
	let surface = $state<HTMLDivElement>();
	let saveError = $state('');
	let loadedImageId: number | undefined;
	let drag = $state<{ pointer: number; index: number; action: string; x: number; y: number; centerX: number; centerY: number; width: number; height: number }>();
	const indices = $derived(edits.pp3 ? maskIndices(edits.pp3) : []);
	const selected = $derived(indices.includes(Number(edits.pp3?.Locallab?.Selspot)) ? Number(edits.pp3.Locallab.Selspot) : indices[0]);
	const config = $derived.by(() => {
		const pp3 = excludePP3(edits.throttledPP3, ['Crop', 'Rotation']);
		if (compare && pp3.Locallab) pp3.Locallab = { ...pp3.Locallab, Enabled: false };
		return toBase64(pp3);
	});
	const src = $derived(`/api/images/${data.image.id}/edit?stage=quick&config=${config}`);
	$effect(() => {
		const image = data.image;
		const pp3 = data.snapshots[0]?.pp3 ?? image.importBaseline ?? BasePP3;
		untrack(() => {
			edits.initialize(pp3, image);
			if (loadedImageId === image.id) return;
			loadedImageId = image.id;
			zoom = 1; pan = { x: 0, y: 0 }; pointers.clear(); drag = undefined;
			gesture = undefined; pinch = undefined; tapStart = undefined; lastTap = undefined;
			compare = false; showOverlay = true; saveError = '';
		});
	});
	beforeNavigate(() => { if (edits.hasChanges) void edits.snapshot().catch(error => { saveError = String(error); }); });
	$effect(() => { if (edits.effectivePP3) edits.updateThrottledPP3(edits.effectivePP3); });
	function start(event: PointerEvent, index: number, action: string) {
		if (drag || pinch || !event.isPrimary || event.button !== 0) return;
		event.preventDefault();
		edits.pp3.Locallab.Selspot = index;
		const target = event.currentTarget as HTMLElement;
		target.setPointerCapture(event.pointerId);
		drag = { pointer: event.pointerId, index, action, x: event.clientX, y: event.clientY, centerX: Number(edits.pp3.Locallab[`CenterX_${index}`]), centerY: Number(edits.pp3.Locallab[`CenterY_${index}`]), width: maskSize(edits.pp3, index, 'width'), height: maskSize(edits.pp3, index, 'height') };
	}
	function move(event: PointerEvent) {
		if (pinch || !drag || drag.pointer !== event.pointerId || !imageArea) return;
		const rect = imageArea.getBoundingClientRect();
		const dx = (event.clientX - drag.x) / rect.width;
		const dy = (event.clientY - drag.y) / rect.height;
		if (drag.action === 'move') {
			edits.pp3.Locallab[`CenterX_${drag.index}`] = Math.round(Math.max(-1000, Math.min(1000, drag.centerX + dx * 2000)));
			edits.pp3.Locallab[`CenterY_${drag.index}`] = Math.round(Math.max(-1000, Math.min(1000, drag.centerY + dy * 2000)));
		} else {
			const signX = drag.action.includes('w') ? -1 : 1;
			const signY = drag.action.includes('n') ? -1 : 1;
			if (drag.action !== 's') setMaskSize(edits.pp3, drag.index, 'width', Math.max(2, Math.min(100, drag.width + signX * dx * 200)));
			if (drag.action !== 'e') setMaskSize(edits.pp3, drag.index, 'height', Math.max(2, Math.min(100, drag.height + signY * dy * 200)));
		}
	}
	function finish(event: PointerEvent) { if (drag?.pointer === event.pointerId) { drag = undefined; edits.pushHistory(true); } }
	function setZoom(value: number, anchor = { x: 0, y: 0 }) {
		const next = Math.max(1, Math.min(8, value));
		const ratio = next / zoom;
		pan = next === 1 ? { x: 0, y: 0 } : { x: anchor.x - (anchor.x - pan.x) * ratio, y: anchor.y - (anchor.y - pan.y) * ratio };
		zoom = next;
	}
	function localPoint(x: number, y: number) {
		const rect = surface!.getBoundingClientRect();
		return { x: x - rect.left - rect.width / 2, y: y - rect.top - rect.height / 2 };
	}
	function surfaceDown(event: PointerEvent) {
		if (event.button !== 0) return;
		event.preventDefault();
		pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
		tapStart = pointers.size === 1 ? { id: event.pointerId, x: event.clientX, y: event.clientY, time: performance.now() } : undefined;
		if (pointers.size === 2) {
			lastTap = undefined;
			if (drag) { drag = undefined; edits.pushHistory(true); }
			const [a, b] = [...pointers.values()];
			const middle = localPoint((a.x + b.x) / 2, (a.y + b.y) / 2);
			pinch = { distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), zoom, ...middle, panX: pan.x, panY: pan.y };
			gesture = undefined;
		} else if (!drag && pointers.size === 1) {
			gesture = { x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y };
		}
		if (!drag) surface?.setPointerCapture(event.pointerId);
	}
	function surfaceMove(event: PointerEvent) {
		if (!pointers.has(event.pointerId)) return;
		if (tapStart && Math.hypot(event.clientX - tapStart.x, event.clientY - tapStart.y) > 10) { tapStart = undefined; lastTap = undefined; }
		pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
		if (pinch && pointers.size === 2) {
			const [a, b] = [...pointers.values()];
			const next = Math.max(1, Math.min(8, pinch.zoom * Math.hypot(a.x - b.x, a.y - b.y) / pinch.distance));
			const middle = localPoint((a.x + b.x) / 2, (a.y + b.y) / 2);
			const ratio = next / pinch.zoom;
			zoom = next;
			pan = next === 1 ? { x: 0, y: 0 } : { x: middle.x - (pinch.x - pinch.panX) * ratio, y: middle.y - (pinch.y - pinch.panY) * ratio };
		} else if (gesture && !drag && zoom > 1) {
			pan = { x: gesture.panX + event.clientX - gesture.x, y: gesture.panY + event.clientY - gesture.y };
		}
	}
	function surfaceEnd(event: PointerEvent) {
		if (!pointers.has(event.pointerId)) return;
		const now = performance.now();
		if (event.type === 'pointerup' && tapStart?.id === event.pointerId && now - tapStart.time < 300 && Math.hypot(event.clientX - tapStart.x, event.clientY - tapStart.y) <= 10) {
			if (lastTap && lastTap.type === event.pointerType && now - lastTap.time < 350 && Math.hypot(event.clientX - lastTap.x, event.clientY - lastTap.y) < 32) {
				setZoom(zoom > 1.05 ? 1 : 3.2, localPoint(event.clientX, event.clientY));
				lastTap = undefined;
			} else lastTap = { x: event.clientX, y: event.clientY, time: now, type: event.pointerType };
		} else lastTap = undefined;
		tapStart = undefined;
		pointers.delete(event.pointerId);
		pinch = undefined;
		gesture = undefined;
		if (surface?.hasPointerCapture(event.pointerId)) surface.releasePointerCapture(event.pointerId);
	}
	function nudge(event: KeyboardEvent, index: number) {
		const keys: Record<string, [string, number]> = { ArrowLeft: ['X', -10], ArrowRight: ['X', 10], ArrowUp: ['Y', -10], ArrowDown: ['Y', 10] };
		const change = keys[event.key]; if (!change) return;
		event.preventDefault(); const key = `Center${change[0]}_${index}`;
		edits.pp3.Locallab[key] = Math.max(-1000, Math.min(1000, Number(edits.pp3.Locallab[key]) + change[1] * (event.shiftKey ? 5 : 1))); edits.pushHistory();
	}
	function resizeKey(event: KeyboardEvent, index: number, axis: 'width' | 'height') {
		if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
		event.preventDefault();
		const direction = event.key === 'ArrowLeft' || event.key === 'ArrowDown' ? -1 : 1;
		setMaskSize(edits.pp3, index, axis, Math.max(2, Math.min(100, maskSize(edits.pp3, index, axis) + direction * (event.shiftKey ? 5 : 1))));
		edits.pushHistory();
	}
</script>

<div class="mask-workspace flex h-full min-h-0 select-none flex-col bg-neutral-950 text-neutral-200 lg:flex-row">
	<main class="relative min-h-0 flex-1 bg-black">
		<div bind:this={surface} role="region" aria-label="Mask photo workspace" class="absolute inset-0 touch-none overflow-hidden p-6 lg:p-10" onpointerdown={surfaceDown} onpointermove={surfaceMove} onpointerup={surfaceEnd} onpointercancel={surfaceEnd} onlostpointercapture={surfaceEnd} onwheel={(event) => { event.preventDefault(); setZoom(zoom * (event.deltaY < 0 ? 1.2 : 1 / 1.2), localPoint(event.clientX, event.clientY)); }}>
			<div class="flex h-full w-full min-h-0 min-w-0 items-center justify-center" bind:clientWidth={viewportWidth} bind:clientHeight={viewportHeight}>
			<div bind:this={imageArea} class="relative shrink-0" style:width={`${displayWidth}px`} style:height={`${displayWidth / aspect}px`} style:transform={`translate(${pan.x}px, ${pan.y}px) scale(${zoom})`}>
				<img {src} alt="Photo with local adjustments" class="block h-full w-full object-contain" draggable="false" onload={(event) => { const image = event.currentTarget as HTMLImageElement; aspect = image.naturalWidth / image.naturalHeight; }} />
				{#if showOverlay && !compare}
					{#each indices as index}
						{@const w = maskSize(edits.pp3, index, 'width')}
						{@const h = maskSize(edits.pp3, index, 'height')}
						<div class="absolute" style:left={`${50 + Number(edits.pp3.Locallab[`CenterX_${index}`]) / 20}%`} style:top={`${50 + Number(edits.pp3.Locallab[`CenterY_${index}`]) / 20}%`} style:width={`${w}%`} style:height={`${h}%`} style:transform="translate(-50%, -50%)">
							<button type="button" aria-label={`Move ${edits.pp3.Locallab[`Name_${index}`]}`} aria-pressed={selected === index} class="absolute inset-0 touch-none border-2 border-dashed border-white/50 bg-white/5 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-sky-300" class:border-sky-300={selected === index} style:border-radius={edits.pp3.Locallab[`Shape_${index}`] === 'ELI' ? '50%' : '0'} class:opacity-40={!edits.pp3.Locallab[`Activ_${index}`]} onpointerdown={(event) => start(event, index, 'move')} onpointermove={move} onpointerup={finish} onpointercancel={finish} onlostpointercapture={finish} onkeydown={(event) => nudge(event, index)} onclick={() => edits.pp3.Locallab.Selspot = index}>
								{#if selected === index}
									<span class="pointer-events-none absolute border border-dotted border-sky-200/60" style:inset={`${(100 - Math.max(0, Math.min(100, Number(edits.pp3.Locallab[`Transit_${index}`] ?? 60)))) / 2}%`} style:border-radius={edits.pp3.Locallab[`Shape_${index}`] === 'ELI' ? '50%' : '0'}></span>
								{/if}
							</button>
							{#if selected === index}
								{#each ['width', 'height'] as axis}
									<button type="button" aria-label={`Resize mask ${axis}`} class="absolute z-10 flex h-11 w-11 touch-none items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-white" style:left={axis === 'width' ? '100%' : '50%'} style:top={axis === 'height' ? '100%' : '50%'} style:transform={`translate(-50%, -50%) scale(${1 / zoom})`} onpointerdown={(event) => start(event, index, axis === 'width' ? 'e' : 's')} onpointermove={move} onpointerup={finish} onpointercancel={finish} onlostpointercapture={finish} onkeydown={(event) => resizeKey(event, index, axis as 'width' | 'height')}><span class="h-3.5 w-3.5 rounded-full border-2 border-neutral-950 bg-sky-200 shadow-lg"></span></button>
								{/each}
							{/if}
						</div>
					{/each}
				{/if}
			</div>
			</div>
		</div>
		<EditorZoomControls {zoom} dragging={!!drag} bottom={16 + Math.max(0, (viewportHeight - displayWidth / aspect) / 2)} onzoomout={() => setZoom(zoom / 1.5)} onzoomin={() => setZoom(zoom * 1.5)}>
			{#if indices.length}
			<span class="mx-1 hidden h-5 w-px bg-neutral-700 lg:block" aria-hidden="true"></span>
			<button class="icon-tool" aria-label="Mask outlines" title="Mask outlines" aria-pressed={showOverlay} onclick={() => showOverlay = !showOverlay}>
				<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><ellipse cx="12" cy="12" rx="9" ry="7" stroke-dasharray="3 2" /></svg>
				<span>Mask</span>
			</button>
			<button class="tool text-xs" aria-pressed={compare} onclick={() => compare = !compare}><IconEye size={20} /><span>Before</span></button>
			{/if}
		</EditorZoomControls>
	</main>
	<EditorToolPanel img={String(data.image.id)} tool="masks">
		{#if edits.pp3}<LocalMasks onadd={() => { showOverlay = true; compare = false; }} />{/if}
		{#if saveError}<p role="alert" class="text-sm text-red-300">{saveError}</p>{/if}
	</EditorToolPanel>
</div>

<style>
	.icon-tool { display: flex; min-height: 44px; min-width: 44px; align-items: center; justify-content: center; border-radius: 9999px; }
	.tool { min-height: 44px; padding: 0 12px; border-radius: 9999px; }
	.icon-tool:hover, .tool:hover { background: #262626; }
	.icon-tool:disabled { opacity: .3; }
	.chosen { background: #f5f5f5; color: #171717; }
	.tool.chosen:hover, .icon-tool.chosen:hover { background: #e5e5e5; }
	button:focus-visible, a:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
</style>
