<script lang="ts">
	import type { TriageImage as Image } from '$lib/similar-images';
	import { untrack } from 'svelte';

	interface Props {
		images: Image[];
		currentId: number;
		busy?: boolean;
		onKeep: (keepIds: number[]) => void;
		onKeepAll: () => void;
		onLater: () => void;
	}

	let { images, currentId, busy = false, onKeep, onKeepAll, onLater }: Props = $props();

	// A fresh group starts with nothing kept; revisiting a sorted group starts from what is currently kept
	let selected = $state(new Set<number>(untrack(() => (images.some((image) => image.isArchived) ? images.filter((image) => !image.isArchived).map((image) => image.id) : []))));
	// The picker opens on the photo triage was showing
	let focus = $state(
		untrack(() =>
			Math.max(
				0,
				images.findIndex((image) => image.id === currentId)
			)
		)
	);
	let swipeStart: number | null = null;
	let strip: HTMLDivElement | undefined;

	// The group can shrink under an open picker; never point past its end
	const focused = $derived(images[Math.min(focus, images.length - 1)]);
	const keeping = $derived(selected.has(focused.id));
	const stageUrl = (image: Image) => `/api/images/${image.id}/preview?size=1600&quality=80&mode=inside&version=${image.version}`;

	// Only the neighbouring shots are fetched ahead; loading the whole group would swamp a slow connection
	$effect(() => {
		for (const step of [1, -1]) {
			const neighbour = images[(focus + step + images.length) % images.length];
			if (neighbour) new Image().src = stageUrl(neighbour);
		}
	});

	// Keep the focused thumbnail in view
	$effect(() => {
		strip?.children[focus]?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
	});

	function move(step: number) {
		focus = (Math.min(focus, images.length - 1) + step + images.length) % images.length;
	}

	function toggle(id: number) {
		selected = selected.has(id) ? new Set([...selected].filter((value) => value !== id)) : new Set([...selected, id]);
	}

	// Archiving the whole group is allowed from the button; the Enter key needs a keeper so it cannot do it by accident
	function confirm(allowEmpty = false) {
		if (busy || (!selected.size && !allowEmpty)) return;
		onKeep(images.filter((image) => selected.has(image.id)).map((image) => image.id));
	}

	function shutter(image: Image) {
		const seconds = Number(image.exposure);
		if (!Number.isFinite(seconds) || seconds <= 0) return image.exposure ? `${image.exposure} s` : null;
		return seconds < 1 ? `1/${Math.round(1 / seconds)}` : `${seconds}`;
	}

	const caption = (image: Image) => [shutter(image), image.aperture ? `f/${image.aperture}` : null, image.iso ? `ISO ${image.iso}` : null].filter(Boolean).join(' · ');

	function handleKeydown(event: KeyboardEvent) {
		if (event.ctrlKey || event.metaKey || event.altKey || document.querySelector('dialog:modal')) return;
		// Enter and Space belong to a focused button, which does its own thing
		if ((event.key === 'Enter' || event.key === ' ') && event.target instanceof Element && event.target.closest('button, a, input, select, textarea')) return;
		if (event.key === 'Escape') onLater();
		else if (event.key === 'Enter') confirm();
		else if (event.key === 'ArrowRight') move(1);
		else if (event.key === 'ArrowLeft') move(-1);
		else if (event.key === ' ' || event.key === 'k') toggle(focused.id);
		else if (/^[1-9]$/.test(event.key) && images[Number(event.key) - 1]) focus = Number(event.key) - 1;
		else return;
		event.preventDefault();
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="absolute inset-0 z-40 flex flex-col bg-neutral-950" role="dialog" aria-label="Pick the best of these similar photos">
	<header class="flex shrink-0 items-center justify-between gap-4 px-4 py-2">
		<h2 class="text-lg font-bold text-neutral-100">{images.length} similar</h2>
		<div class="flex items-center gap-6">
			<button type="button" class="min-h-11 text-base font-semibold text-neutral-300 hover:text-white disabled:opacity-40" disabled={busy} onclick={onKeepAll}>Keep all</button>
			<button type="button" class="min-h-11 text-base font-semibold text-neutral-300 hover:text-white" onclick={onLater}>Later</button>
		</div>
	</header>

	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="relative min-h-0 flex-1 touch-pan-y select-none"
		onpointerdown={(event) => (swipeStart = event.clientX)}
		onpointerup={(event) => {
			if (swipeStart !== null && Math.abs(event.clientX - swipeStart) > 50) move(event.clientX < swipeStart ? 1 : -1);
			swipeStart = null;
		}}
		onpointercancel={() => (swipeStart = null)}
	>
		<img src={stageUrl(focused)} alt={`Shot ${focus + 1} of ${images.length}`} class="absolute inset-0 h-full w-full object-contain" draggable="false" />
		{#if focused.isArchived}<span class="pointer-events-none absolute top-2 right-2 rounded-full bg-neutral-100 px-3 py-1 text-sm font-semibold text-neutral-950">Archived</span
			>{/if}
		<span class="pointer-events-none absolute top-2 left-2 rounded-full bg-neutral-950/70 px-3 py-1 text-sm text-neutral-200 tabular-nums backdrop-blur"
			>{focus + 1}/{images.length}{caption(focused) ? ` · ${caption(focused)}` : ''}</span
		>
		<button
			type="button"
			aria-pressed={keeping}
			class="absolute bottom-4 left-1/2 min-h-14 -translate-x-1/2 rounded-full px-8 text-base font-bold shadow-xl backdrop-blur {keeping
				? 'bg-neutral-100 text-neutral-950'
				: 'border border-neutral-300 bg-neutral-950/70 text-neutral-100'}"
			onpointerdown={(event) => event.stopPropagation()}
			onclick={() => toggle(focused.id)}>{keeping ? '✓ Keeping' : 'Keep this one'}</button
		>
		{#if images.length > 1}
			<button
				type="button"
				aria-label="Previous shot"
				class="absolute top-1/2 left-1 hidden h-12 w-12 -translate-y-1/2 rounded-full bg-neutral-950/60 text-2xl text-neutral-100 hover:bg-neutral-100 hover:text-neutral-950 md:block"
				onclick={() => move(-1)}>‹</button
			>
			<button
				type="button"
				aria-label="Next shot"
				class="absolute top-1/2 right-1 hidden h-12 w-12 -translate-y-1/2 rounded-full bg-neutral-950/60 text-2xl text-neutral-100 hover:bg-neutral-100 hover:text-neutral-950 md:block"
				onclick={() => move(1)}>›</button
			>
		{/if}
	</div>

	<div bind:this={strip} class="flex shrink-0 gap-2 overflow-x-auto px-3 py-2">
		{#each images as image, index (image.id)}
			<button
				type="button"
				aria-label={`Shot ${index + 1}${selected.has(image.id) ? ', keeping' : ''}`}
				class="relative aspect-[3/2] h-16 shrink-0 overflow-hidden rounded-lg border-2 sm:h-20 {index === focus ? 'border-neutral-100' : 'border-transparent'}"
				onclick={() => (focus = index)}
			>
				<img
					src={`/api/images/${image.id}/preview?size=256&quality=60&mode=inside&version=${image.version}`}
					alt=""
					loading="lazy"
					class="h-full w-full object-cover"
					draggable="false"
				/>
				{#if image.isArchived}<span class="absolute bottom-0.5 left-0.5 rounded bg-neutral-950/80 px-1 text-[10px] font-semibold text-neutral-200">Archived</span>{/if}
				{#if selected.has(image.id)}<span class="absolute top-0.5 right-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-neutral-100 text-xs font-bold text-neutral-950"
						>✓</span
					>{/if}
			</button>
		{/each}
	</div>

	<footer class="shrink-0 border-t border-neutral-800 p-3">
		<button
			type="button"
			class="min-h-14 w-full rounded-xl text-base font-bold disabled:opacity-40 {selected.size
				? 'bg-neutral-100 text-neutral-950 hover:bg-white'
				: 'border border-neutral-500 text-neutral-200 hover:bg-neutral-800'}"
			disabled={busy}
			onclick={() => confirm(true)}
		>
			{selected.size ? 'Done' : 'Archive all'}
		</button>
	</footer>
</div>
