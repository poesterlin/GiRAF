<script lang="ts">
	import type { Snippet } from 'svelte';
	import { edits } from '$lib/state/editing.svelte';
	import { IconArrowBackUp, IconArrowForwardUp } from './icons';
	import EditModeNav from './EditModeNav.svelte';
	import EditorTools from './EditorTools.svelte';
	let { img, tool, children, onundo = () => edits.undo(), onredo = () => edits.redo() }: {
		img: string; tool: 'masks' | 'retouch'; children: Snippet; onundo?: () => void; onredo?: () => void;
	} = $props();
</script>

<aside class="flex min-h-0 max-h-[50dvh] shrink-0 flex-col overflow-hidden border-t border-neutral-800 lg:max-h-full lg:w-80 lg:border-l lg:border-t-0">
	<div class="flex shrink-0 items-center justify-between gap-2 border-b border-neutral-800 px-2 py-1 lg:border-0 lg:px-5 lg:pt-3">
		<h1 class="sr-only">{tool === 'masks' ? 'Masks' : 'Retouch'}</h1>
		<div class="flex items-center gap-1">
			<button disabled={!edits.canUndo} aria-label="Undo" onclick={onundo}><IconArrowBackUp size={20} /></button>
			<button disabled={!edits.canRedo} aria-label="Redo" onclick={onredo}><IconArrowForwardUp size={20} /></button>
		</div>
		<div class="lg:hidden"><EditModeNav {img} showEdit showCrop showMasks={tool !== 'masks'} showRetouch={tool !== 'retouch'} /></div>
	</div>
	<div class="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain p-3 lg:p-5">
		<div class="mb-6 hidden lg:block"><EditorTools {img} currentTool={tool} /></div>
		<div class="space-y-3">{@render children()}</div>
	</div>
</aside>

<style>
	@media (max-width: 1023px) {
		button:not(:disabled) { color: #f5f5f5; background: #ffffff1a; }
	}
	button { display: flex; min-height: 44px; min-width: 44px; align-items: center; justify-content: center; border-radius: 9999px; }
	button:hover { background: #262626; }
	button:disabled { opacity: .3; }
	button:focus-visible, a:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
</style>
