<script lang="ts">
	import { edits } from '$lib/state/editing.svelte';
	import { untrack } from 'svelte';
	import ImageNavigation from '$lib/ui/ImageNavigation.svelte';
	let navigationBusy = $state(false);

	let { children } = $props();

	$effect(() => {
		const newPP3 = $state.snapshot(edits.effectivePP3);
		untrack(() => edits.updateThrottledPP3(newPP3));
	});

	$effect(() => {
		if (edits.throttledPP3) {
			edits.isLoading = true;
		}
	});
</script>

<div class="editor-layout relative flex h-full min-h-0 flex-col overflow-hidden">
	<div class="min-h-0 flex-1 overflow-hidden" inert={navigationBusy}>{@render children?.()}</div>
	<div class="shrink-0 lg:absolute lg:bottom-0 lg:right-0 lg:w-[380px]"><ImageNavigation bind:busy={navigationBusy} /></div>
</div>

<style>
	@media (min-width: 1024px) {
		.editor-layout :global(aside) { padding-bottom: 53px; }
	}
</style>
