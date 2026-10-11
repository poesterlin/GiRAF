<script lang="ts">
	import type { Snippet } from 'svelte';
	import Section from './Section.svelte';
	import { edits } from '$lib/state/editing.svelte';
	let { title, group, children }: { title: string; group: string; children: Snippet } = $props();
	const enabled = $derived(!edits.disabledGroups.includes(group));
</script>

<div class="adjustment-group relative">
	<Section {title} section="" showToggle={false}>
		<fieldset class="min-w-0 space-y-3 border-0 p-0" class:opacity-50={!enabled}>
			{@render children()}
		</fieldset>
	</Section>
	<button
		type="button"
		class="bypass absolute top-0 right-2 flex h-11 w-11 items-center justify-center rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400"
		aria-label={`Enable ${title}`}
		aria-pressed={enabled}
		title={enabled ? `Bypass ${title}` : `Enable ${title}`}
		onclick={() => edits.toggleGroup(group)}
	>
		<span class="flex h-7 w-7 items-center justify-center" class:opacity-40={!enabled}>
			<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
				<path d="M12 3v9M7 5.5a8 8 0 1 0 10 0" />
				{#if !enabled}<path d="m4 4 16 16" />{/if}
			</svg>
		</span>
	</button>
</div>

<style>
	.bypass { color: #a3a3a3; transition: color 150ms; }
	.bypass:hover { color: #f5f5f5; }
	.adjustment-group:has(:global(details[open])) > .bypass { color: #262626; }
	.adjustment-group:has(:global(details[open])) > .bypass:hover { color: #000; }
	@media (prefers-reduced-motion: reduce) { .bypass { transition: none; } }
</style>
