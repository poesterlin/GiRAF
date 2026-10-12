<script lang="ts">
	import type { Snippet } from 'svelte';
	import { edits } from '$lib/state/editing.svelte';
	import EditorMobileToolbar from './EditorMobileToolbar.svelte';
	import EditorTools from './EditorTools.svelte';
	import EditorPanelHeader from './EditorPanelHeader.svelte';
	let { img, tool, children, loading = false, onundo = () => edits.undo(), onredo = () => edits.redo() }: {
		img: string; tool: 'masks' | 'retouch'; children: Snippet; loading?: boolean; onundo?: () => void; onredo?: () => void;
	} = $props();
</script>

<aside class="flex min-h-0 max-h-[50dvh] shrink-0 flex-col overflow-hidden border-t border-neutral-800 bg-neutral-950 lg:h-full lg:max-h-full lg:w-[380px] lg:border-l lg:border-t-0">
	<EditorPanelHeader title={tool === 'masks' ? 'Masks' : 'Retouch'} {onundo} {onredo} {loading} />
	<h1 class="sr-only lg:hidden">{tool === 'masks' ? 'Masks' : 'Retouch'}</h1>
	<div class="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain">
		<EditorMobileToolbar {img} currentTool={tool} {onundo} {onredo} />
		<div class="p-3 lg:px-6 lg:py-4">
		<div class="mb-6 hidden lg:block"><EditorTools {img} currentTool={tool} /></div>
		<div class="space-y-3">{@render children()}</div>
		</div>
	</div>
</aside>
