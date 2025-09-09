<script lang="ts">
	import { edits } from '$lib/state/editing.svelte';

	let { children } = $props();

	$effect(() => {
		const newPP3 = $state.snapshot(edits.pp3);
		edits.updateThrottledPP3(newPP3);
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

{@render children?.()}
