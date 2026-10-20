<script lang="ts">
	import type { Snippet } from 'svelte';
	import { edits } from '$lib/state/editing.svelte';
	import Checkbox from './Checkbox.svelte';

	let {
		title,
		section,
		group,
		checked,
		onchange,
		children
	}: { title: string; section?: string; group?: string; checked?: boolean; onchange?: (value: boolean) => void; children: Snippet } = $props();
	// A mask's subsection is no PP3 section, so its caller owns the switch, as with AdjustmentGroup
	const enabled = $derived(checked ?? (group ? !edits.disabledGroups.includes(group) : !!section && edits.pp3[section]?.Enabled !== false));
	function toggle(value: boolean) {
		if (onchange) onchange(value);
		else if (group) edits.toggleGroup(group);
		else if (section) {
			edits.pp3[section].Enabled = value;
			edits.pushHistory(true);
		}
	}
</script>

<section class="space-y-3">
	<div class="flex min-h-11 items-center justify-between gap-3 border-b border-neutral-700/60 pb-2">
		<h3 class="text-xs font-semibold tracking-wider text-neutral-300 uppercase">{title}</h3>
		<Checkbox label="" ariaLabel={`Enable ${title}`} checked={enabled} small onchange={toggle} />
	</div>
	<fieldset class="min-w-0 space-y-3 border-0 p-0" class:opacity-50={!enabled}>
		{@render children()}
	</fieldset>
</section>
