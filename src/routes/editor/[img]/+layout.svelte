<script lang="ts">
	import { edits } from '$lib/state/editing.svelte';
	import { untrack } from 'svelte';

	let { children } = $props();

	$effect(() => {
		const newPP3 = $state.snapshot(edits.pp3);
		untrack(() => edits.updateThrottledPP3(newPP3));
	});

	$effect(() => {
		// const pp3 = $state.snapshot(edits.throttledPP3);
		// edits.update(pp3);
	});

	$effect(() => {
		if (edits.throttledPP3) {
			edits.isLoading = true;
		}
	});
</script>

<div class="h-[calc(100dvh-4rem)]">
	{@render children?.()}
</div>
