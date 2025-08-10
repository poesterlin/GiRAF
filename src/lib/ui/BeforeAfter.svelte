<script lang="ts">
	interface Props {
		beforeImage: string;
		afterImage: string;
		filename?: string;
		dimensions?: string;
	}

	let { beforeImage, afterImage, filename, dimensions }: Props = $props();

	let pos = $state(0.5); // 0..1 portion of the container where the handle sits
	let dragging = false;
	let container: HTMLDivElement | null = null;
	let pointerId = null;
	let naturalW = 0;
	let naturalH = 0;

	const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));

	function updatePosFromClientX(x: number) {
		if (!container) return;
		const rect = container.getBoundingClientRect();
		pos = clamp((x - rect.left) / rect.width);
	}

	function onPointerDown(e: PointerEvent) {
		e.preventDefault();
		dragging = true;
		pointerId = e.pointerId;
		container?.setPointerCapture(pointerId);
		updatePosFromClientX(e.clientX);
	}

	function onPointerMove(e: PointerEvent) {
		if (!dragging) return;
		updatePosFromClientX(e.clientX);
	}

	function onPointerUp(e: PointerEvent) {
		if (!dragging) return;
		dragging = false;
		container?.releasePointerCapture(e.pointerId);
	}

	function onKeyDown(e: KeyboardEvent) {
		const step = e.shiftKey ? 0.1 : 0.05;
		if (e.key === 'ArrowLeft') pos = clamp(pos - step);
		else if (e.key === 'ArrowRight') pos = clamp(pos + step);
		else if (e.key === 'Home') pos = 0;
		else if (e.key === 'End') pos = 1;
	}

	function onBeforeLoad(ev: Event) {
		const t = ev.target as HTMLImageElement;
		naturalW = t.naturalWidth || naturalW;
		naturalH = t.naturalHeight || naturalH;
		if (!dimensions && naturalW && naturalH) {
			dimensions = `${naturalW} × ${naturalH}`;
		}
	}
</script>

<div
	class="relative flex items-center justify-center overflow-hidden w-2xl h-64
  bg-[var(--bg-1)]"
>
	<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
	<div
		tabindex="0"
		bind:this={container}
		class="group relative max-h-[90%] max-w-[90%] w-full h-full
      overflow-hidden rounded-lg shadow-[0_12px_30px_rgba(0,0,0,0.55)]"
		role="group"
		aria-label="Before / After image slider"
		onpointerdown={onPointerDown}
		onpointermove={onPointerMove}
		onpointerup={onPointerUp}
		onpointercancel={onPointerUp}
		onpointerleave={onPointerUp}
		onkeydown={onKeyDown}
	>
		<!-- before image (bottom layer) -->
		<img src={beforeImage} alt={filename || 'before image'} class="absolute inset-0 block h-full w-full object-contain" onload={onBeforeLoad} />

		<!-- after image (top layer; clipped by clip-path) -->
		<img
			src={afterImage}
			alt={filename || 'after image'}
			class="pointer-events-none absolute inset-0 block h-full w-full
        object-contain"
			style="clip-path: inset(0 {100 - pos * 100}% 0 0);"
		/>

		<!-- hover overlay (info). pointer-events-none so it doesn't block slider -->
		<div
			class="pointer-events-none absolute inset-0 opacity-0
        transition-opacity duration-200 group-hover:opacity-100"
			style="background-image: linear-gradient(to bottom,
        rgba(0,0,0,0.6) 0%, rgba(0,0,0,0) 20%,
        rgba(0,0,0,0) 80%, rgba(0,0,0,0.6) 100%);"
		>
			<div
				class="pointer-events-none absolute top-4 left-4 flex flex-col
        gap-1"
			>
				<span class="font-semibold text-white">{filename}</span>
				<span class="text-sm text-white/70">{dimensions}</span>
			</div>
		</div>

		<!-- draggable handle -->
		<button
			type="button"
			role="slider"
			aria-label="Drag to reveal after image"
			aria-valuemin="0"
			aria-valuemax="100"
			aria-valuenow={Math.round(pos * 100)}
			class="absolute z-20 flex h-8 w-8 cursor-grab items-center
        justify-center rounded-full bg-white/90 transition-colors
        duration-150 hover:bg-white focus:ring-2 focus:ring-indigo-500
        focus:ring-offset-2 focus:outline-none active:cursor-grabbing"
			style="left: {pos * 100}%; top: 50%; transform: translate(-50%, -50%);"
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				width="14"
				height="14"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
				class="text-gray-700"
			>
				<path d="M12 3v18" />
				<path d="M8 7l-4 5 4 5" />
				<path d="M16 7l4 5-4 5" />
			</svg>
		</button>
	</div>
</div>
