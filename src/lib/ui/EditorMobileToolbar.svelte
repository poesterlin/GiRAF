<script lang="ts">
	import type { EditorTool } from '$lib/editor-tools';
	import { edits } from '$lib/state/editing.svelte';
	import EditorTools from './EditorTools.svelte';
	import { IconArrowBackUp, IconArrowForwardUp } from './icons';
	let { img, currentTool = 'adjustments', onundo = () => edits.undo(), onredo = () => edits.redo() }: {
		img: string; currentTool?: EditorTool; onundo?: () => void; onredo?: () => void;
	} = $props();
</script>

<div class="flex shrink-0 items-center gap-3 border-b border-neutral-700 lg:hidden">
	<EditorTools {img} {currentTool} />
	<div class="history-controls flex shrink-0 items-center" role="group" aria-label="Edit history">
		<button disabled={!edits.canUndo} aria-label="Undo" onclick={onundo}><IconArrowBackUp size={22} /></button>
		<button disabled={!edits.canRedo} aria-label="Redo" onclick={onredo}><IconArrowForwardUp size={22} /></button>
	</div>
</div>

<style>
	.history-controls { border-left: 1px solid #737373; background: #303030; }
	button { display: flex; height: 48px; width: 48px; align-items: center; justify-content: center; color: #f5f5f5; background: transparent; }
	button + button { border-left: 1px solid #404040; }
	button:hover:not(:disabled) { background: #404040; }
	button:disabled { color: #737373; }
	button:focus-visible { outline: 2px solid #fff; outline-offset: -2px; }
</style>
