<script lang="ts">
	import type { Snippet } from 'svelte';
	import { edits } from '$lib/state/editing.svelte';
	import Checkbox from './Checkbox.svelte';

	let { title, section, group, children }: { title: string; section?: string; group?: string; children: Snippet } = $props();
	const enabled = $derived(group ? !edits.disabledGroups.includes(group) : !!section && edits.pp3[section]?.Enabled !== false);
	function toggle(value: boolean) {
		if (group) edits.toggleGroup(group);
		else if (section) {
			edits.pp3[section].Enabled = value;
			edits.pushHistory(true);
		}
	}
</script>

<section class="space-y-3">
	<div class="flex min-h-11 items-center justify-between gap-3 border-b border-neutral-700/60 pb-2">
		<h3 class="text-xs font-semibold uppercase tracking-wider text-neutral-300">{title}</h3>
		<Checkbox label="" ariaLabel={`Enable ${title}`} checked={enabled} small onchange={toggle} />
	</div>
	<fieldset disabled={!enabled} inert={!enabled} class="min-w-0 space-y-3 border-0 p-0" class:opacity-50={!enabled}>
		{@render children()}
	</fieldset>
</section>
