<script lang="ts">
	import { editorToolUrl, type EditorTool } from '$lib/editor-tools';
	import EditorToolIcon from './EditorToolIcon.svelte';
	let { img, currentTool, query }: { img: string; currentTool: EditorTool; query: string } = $props();
	const pages: { tool: EditorTool; label: string }[] = [
		{ tool: 'adjustments', label: 'Adjustments' }, { tool: 'crop', label: 'Crop' },
		{ tool: 'masks', label: 'Masks' }, { tool: 'retouch', label: 'Retouch' }
	];
</script>

<nav aria-label="Editor pages">
	{#each pages as { tool, label }}
		<a href={editorToolUrl(img, tool, query)} aria-current={tool === currentTool ? 'page' : undefined}><EditorToolIcon {tool} /><span>{label}</span></a>
	{/each}
</nav>

<style>
	nav { display: flex; border-bottom: 1px solid #404040; color: #d4d4d4; }
	a { text-decoration: none; min-height: 44px; display: flex; align-items: center; flex: 1; flex-direction: column; justify-content: center; gap: 6px; padding: 10px 2px; font-size: 11px; border-bottom: 2px solid transparent; }
	a:hover { color: #fff; background: #ffffff0a; }
	a:focus-visible { outline: 2px solid #fff; outline-offset: 3px; }
	a[aria-current] { color: #fff; border-bottom-color: #f5f5f5; background: #ffffff08; }
</style>
