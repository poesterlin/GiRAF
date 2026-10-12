<script lang="ts">
	import { edits } from '$lib/state/editing.svelte';
	import { IconArrowBackUp, IconArrowForwardUp } from './icons';
	import PreviewLoading from './PreviewLoading.svelte';
	let { title, onundo = () => edits.undo(), onredo = () => edits.redo(), loading = false }: {
		title: string; onundo?: () => void; onredo?: () => void; loading?: boolean;
	} = $props();
</script>

<div class="hidden shrink-0 items-center justify-between border-b border-neutral-800 px-6 py-4 lg:flex">
	<div class="flex items-center gap-3"><div class="h-2 w-2 rounded-full bg-neutral-500"></div><h2 class="text-xs font-bold uppercase tracking-widest text-neutral-400">{title}</h2></div>
	<div class="flex items-center gap-1">
		<PreviewLoading {loading} />
		<button onclick={onundo} disabled={!edits.canUndo} aria-label="Undo"><IconArrowBackUp size={16} /></button>
		<button onclick={onredo} disabled={!edits.canRedo} aria-label="Redo"><IconArrowForwardUp size={16} /></button>
	</div>
</div>

<style>
	button { display: flex; height: 28px; width: 28px; align-items: center; justify-content: center; border-radius: 6px; color: #737373; }
	button:hover { background: #262626; color: #e5e5e5; }
	button:disabled { pointer-events: none; opacity: .25; }
	button:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
</style>
