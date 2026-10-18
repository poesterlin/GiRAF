<script lang="ts">
	import { page } from '$app/state';
	import { editorFilterQuery, readEditorFilters } from '$lib/editor-filters';
	import type { EditorTool } from '$lib/editor-tools';
	import EditorPageTabs from './EditorPageTabs.svelte';
	let { img, currentTool = 'adjustments' }: { img: string; currentTool?: EditorTool } = $props();
	const query = $derived(editorFilterQuery(readEditorFilters(page.url.searchParams)));
</script>

<div class="w-full min-w-0"><EditorPageTabs {img} {currentTool} {query} /></div>
