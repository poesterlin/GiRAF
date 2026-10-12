<script lang="ts">
	import type { Snippet } from 'svelte';
	import IconPlus from '@tabler/icons-svelte/icons/plus';
	import IconMinus from '@tabler/icons-svelte/icons/minus';
	import IconMaximize from '@tabler/icons-svelte/icons/maximize';
	let { zoom, onzoomin, onzoomout, onfit, children, dragging = false, bottom = 16 }: {
		zoom: number; onzoomin: () => void; onzoomout: () => void; onfit?: () => void; children?: Snippet; dragging?: boolean; bottom?: number;
	} = $props();
</script>

<div class="image-controls floating-pill" class:dragging style:bottom="{bottom}px">
	<div class="hidden items-center lg:flex">
	<button aria-label="Zoom out" disabled={zoom === 1} onclick={onzoomout}><IconMinus size={18} /></button>
	<span class="min-w-10 text-center text-xs tabular-nums">{zoom.toFixed(1)}×</span>
	<button aria-label="Zoom in" disabled={zoom === 8} onclick={onzoomin}><IconPlus size={18} /></button>
	{#if onfit}<div class="hidden lg:block"><button aria-label="Fit photo" onclick={onfit}><IconMaximize size={18} /></button></div>{/if}
	</div>
	{@render children?.()}
</div>

<style>
	.image-controls { position: absolute; left: 50%; transform: translateX(-50%); transition: opacity .2s; }
	.image-controls.dragging { opacity: .5; }
	.image-controls > :global(button) { display: flex; align-items: center; justify-content: center; gap: 6px; min-height: 44px; padding: 0 16px; border: 0; border-radius: 999px; background: transparent; color: #fff; font-size: 14px; font-weight: 500; transition: background .15s, transform .1s; }
	.image-controls > :global(button + button) { position: relative; margin-left: 4px; }
	.image-controls > :global(button + button::before) { content: ''; position: absolute; left: -3px; top: 10px; bottom: 10px; width: 1px; background: rgba(255,255,255,.1); }
	.image-controls > :global(button[aria-pressed='true']) { background: rgba(255,255,255,.1); color: #f5f5f5; }
	.image-controls > :global(button:hover) { background: rgba(255,255,255,.18); }
	.image-controls > :global(button:active) { transform: scale(.96); background: rgba(255,255,255,.18); }
	@media (max-width: 1023px) {
		.image-controls:not(:has(> :global(button))) { display: none; }
	}
	button { display: flex; min-height: 44px; min-width: 44px; align-items: center; justify-content: center; border-radius: 9999px; }
	button:hover { background: #262626; }
	button:disabled { opacity: .3; }
	button:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
</style>
