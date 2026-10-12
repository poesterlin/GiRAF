<script lang="ts">
	import { page } from '$app/state';
	import { beforeNavigate } from '$app/navigation';
	import { editorFilterQuery, readEditorFilters } from '$lib/editor-filters';
	import { IconChevronLeft } from './icons';
	import IconMenu from '@tabler/icons-svelte/icons/menu';
	let { triageEnabled }: { triageEnabled: boolean } = $props();
	let menu = $state<HTMLDetailsElement>();
	const query = $derived(editorFilterQuery(readEditorFilters(page.url.searchParams)));
	beforeNavigate(() => { if (menu) menu.open = false; });
</script>

<svelte:window onpointerdown={(event) => { if (menu && !menu.contains(event.target as Node)) menu.open = false; }} onkeydown={(event) => { if (event.key === 'Escape' && menu) menu.open = false; }} />
<div class="flex min-w-0 flex-1 items-center gap-2 lg:hidden">
	<a href={`/gallery${query}`} class="flex h-11 w-11 shrink-0 items-center justify-center rounded-md hover:bg-neutral-800" aria-label="Back to gallery"><IconChevronLeft size={20} /></a>
	<span class="min-w-0 flex-1 truncate text-xs text-neutral-300" title={page.data.image?.name}>{page.data.image?.name ?? 'Editor'}</span>
	<details bind:this={menu} class="relative shrink-0">
		<summary class="flex h-11 w-11 cursor-pointer list-none items-center justify-center rounded-md hover:bg-neutral-800" aria-label="App navigation"><IconMenu size={20} /></summary>
		<nav aria-label="App navigation" class="absolute right-0 top-full z-50 mt-1 w-44 rounded-lg border border-neutral-700 bg-neutral-950 p-1 shadow-xl">
			<a href="/importer">Import</a>
			<a href={`/gallery${query}`}>Gallery</a>
			{#if triageEnabled}<a href="/triage">Triage</a>{/if}
			<a href="/exporter">Export</a>
			<a href="/settings">Settings</a>
		</nav>
	</details>
</div>

<style>
	summary::-webkit-details-marker { display: none; }
	nav a { display: flex; align-items: center; min-height: 44px; padding: 0 12px; border-radius: 4px; font-size: 13px; }
	nav a:hover { background: #262626; }
	a:focus-visible, summary:focus-visible { outline: 2px solid white; outline-offset: -2px; }
</style>
