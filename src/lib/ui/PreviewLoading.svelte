<script lang="ts">
	import { IconFidgetSpinner } from './icons';
	import { fade } from 'svelte/transition';
	let { loading, overlay = false }: { loading: boolean; overlay?: boolean } = $props();
</script>

{#if loading}
	<div in:fade={{ duration: 150, delay: 200 }} role="status" aria-label="Updating edited preview" class={overlay ? 'pointer-events-none absolute left-3 bottom-3 z-30 flex items-center gap-2 rounded-lg border border-white/20 bg-neutral-950/90 px-3 py-2 text-xs font-medium text-white shadow-lg backdrop-blur-md lg:hidden' : 'mr-2 text-neutral-500'}>
		<span class="spinner"><IconFidgetSpinner size={16} /></span>
		{#if overlay}<span aria-hidden="true">Updating</span>{/if}
	</div>
{/if}

<style>
	.spinner { display: flex; animation: spin 1s linear infinite; }
	@keyframes spin { to { transform: rotate(360deg); } }
	@media (prefers-reduced-motion: reduce) { .spinner { animation: none; } }
</style>
