<script lang="ts">
	import type { Snippet } from 'svelte';
	let { children, dragging = false, bottom = 16 }: {
		zoom: number; onzoomin: () => void; onzoomout: () => void; onfit?: () => void; children?: Snippet; dragging?: boolean; bottom?: number;
	} = $props();
</script>

<div class="image-controls floating-pill" class:dragging style:bottom="{bottom}px">
	{@render children?.()}
</div>

<style>
	.image-controls { position: absolute; left: 50%; transform: translateX(-50%); transition: opacity .2s; }
	.image-controls.dragging { opacity: .5; }
	.image-controls:not(:has(> :global(button))) { display: none; }
	.image-controls > :global(button) { display: flex; align-items: center; justify-content: center; gap: 6px; min-height: 44px; padding: 0 16px; border: 0; border-radius: 999px; background: transparent; color: #fff; font-size: 14px; font-weight: 500; transition: background .15s, transform .1s; }
	.image-controls > :global(button + button) { position: relative; margin-left: 4px; }
	.image-controls > :global(button + button::before) { content: ''; position: absolute; left: -3px; top: 10px; bottom: 10px; width: 1px; background: rgba(255,255,255,.1); }
	.image-controls > :global(button[aria-pressed='true']) { background: rgba(255,255,255,.1); color: #f5f5f5; }
	.image-controls > :global(button:hover) { background: rgba(255,255,255,.18); }
	.image-controls > :global(button:active) { transform: scale(.96); background: rgba(255,255,255,.18); }
	@media (min-width: 1024px) {
		.image-controls { left: 16px; top: 50%; bottom: auto !important; transform: translateY(-50%); flex-direction: column; }
		.image-controls > :global(button) { width: 100%; padding: 0 10px; font-size: 12px; }
		.image-controls > :global(button + button) { margin-left: 0; }
		.image-controls > :global(button + button::before) { left: 10px; right: 10px; top: -1px; bottom: auto; width: auto; height: 1px; }
	}
	@media (max-width: 1023px) {
		.image-controls { left: auto; right: 8px; transform: none; padding: 2px; border-radius: 8px; }
		.image-controls > :global(button) { padding: 0 10px; font-size: 11px; gap: 5px; border-radius: 6px; }
		.image-controls > :global(button svg) { width: 16px; height: 16px; }
		.image-controls > :global(button[aria-pressed='true']) { background: #404040; }
		.image-controls:not(:has(> :global(button))) { display: none; }
	}
</style>
