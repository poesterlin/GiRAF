<script lang="ts">
	import type { Snippet } from 'svelte';
	import Section from './Section.svelte';
	import Checkbox from './Checkbox.svelte';
	import { edits } from '$lib/state/editing.svelte';
	let { title, group, children }: { title: string; group: string; children: Snippet } = $props();
	const enabled = $derived(!edits.disabledGroups.includes(group));
</script>

<div class="relative">
	<Section {title} section="" showToggle={false}>
		<fieldset disabled={!enabled} inert={!enabled} class="min-w-0 space-y-3 border-0 p-0" class:opacity-50={!enabled}>
			{@render children()}
		</fieldset>
	</Section>
	<div class="absolute top-2 right-4">
		<Checkbox label="" ariaLabel={`Enable ${title}`} checked={enabled} small onchange={() => edits.toggleGroup(group)} />
	</div>
</div>
