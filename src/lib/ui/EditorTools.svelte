<script lang="ts">
	import { page } from '$app/state';
	import { editorFilterQuery, readEditorFilters } from '$lib/editor-filters';
	import { editorTools, editorToolUrl, type EditorTool } from '$lib/editor-tools';
	import EditorToolIcon from './EditorToolIcon.svelte';
	import EditorPageTabs from './EditorPageTabs.svelte';
	let { img, currentTool = 'adjustments' }: { img: string; currentTool?: EditorTool } = $props();
	const tools = $derived(currentTool === 'adjustments' ? editorTools : [{ tool: 'adjustments' as const, label: 'Adjustments' }, ...editorTools.filter(item => item.tool !== currentTool)]);
	const query = $derived(editorFilterQuery(readEditorFilters(page.url.searchParams)));
</script>

<div class="hidden w-full lg:block"><EditorPageTabs {img} {currentTool} {query} /></div>
<nav aria-label="Editing tools" class="flex w-full items-center gap-3 lg:hidden">
	{#each tools as { tool, label }}
		<a href={editorToolUrl(img, tool, query)}><EditorToolIcon {tool} /><span>{label}</span></a>
	{/each}
</nav>

<style>
	a { display: flex; flex: 1; min-height: 44px; align-items: center; justify-content: center; gap: 6px; border: 1px solid #262626; border-radius: 12px; padding: 0 8px; background: #171717; color: #d4d4d4; font-size: 12px; font-weight: 600; }
	a:hover { background: #262626; color: #f5f5f5; }
	a:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
</style>
