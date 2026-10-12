<script lang="ts">
	import { edits } from '$lib/state/editing.svelte';
	import { IconArrowBackUp, IconArrowForwardUp } from './icons';
	import PreviewLoading from './PreviewLoading.svelte';
	import EditorToolIcon from './EditorToolIcon.svelte';
	import { page } from '$app/state';
	import { editorToolFromPath } from '$lib/editor-tools';
	let { title, onundo = () => edits.undo(), onredo = () => edits.redo(), loading = false }: {
		title: string; onundo?: () => void; onredo?: () => void; loading?: boolean;
	} = $props();
</script>

<div class="hidden shrink-0 items-center justify-between px-6 pt-3 pb-1 lg:flex">
	<h2 class="flex items-center gap-2 text-sm font-medium text-neutral-400"><EditorToolIcon tool={editorToolFromPath(page.url.pathname)} size={16} />{title}</h2>
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
