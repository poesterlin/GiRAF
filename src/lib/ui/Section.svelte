<script lang="ts">
	import type { Snippet } from 'svelte';
	import Checkbox from './Checkbox.svelte';
	import { edits } from '$lib/state/editing.svelte';
	import { IconChevronRight } from '$lib/ui/icons';

	interface Props {
		title: string;
		section: string;
		children: Snippet<[]>;
		enabledKey?: string;
		showToggle?: boolean;
	}

	let { title, section, children, enabledKey = 'Enabled', showToggle = true }: Props = $props();

	let enabled = $derived.by(() => {
		const sectionState = edits.pp3?.[section];
		const hasToggle = showToggle && !!enabledKey && !!sectionState && enabledKey in sectionState;
		return hasToggle ? (sectionState[enabledKey] as boolean) : true;
	});

	function setEnabled(value: boolean) {
		const sectionState = edits.pp3?.[section];
		if (!sectionState || !enabledKey || !(enabledKey in sectionState)) {
			return;
		}

		enabled = value;
		sectionState[enabledKey] = value;
		edits.pushHistory();
	}

</script>

<div class="relative mb-1">
	<details class="">
		<summary class="mb-1 flex cursor-pointer items-center rounded-lg bg-neutral-800 px-4 py-2 pr-14 select-none">
			<IconChevronRight class="mr-2 shrink-0" />
			<span class="font-medium text-zinc-300 select-none">{title}</span>
		</summary>
		<div class="flex flex-col gap-2 px-4 py-2" class:opacity-70={!enabled}>
			{@render children()}
		</div>
	</details>
	{#if showToggle}
		<div class="pointer-events-none absolute inset-y-0.5 right-4 flex items-start pt-2">
			<div class="pointer-events-auto">
				<Checkbox label="" checked={enabled} onchange={(e) => setEnabled(e)} small></Checkbox>
			</div>
		</div>
	{/if}
</div>

<style>
	details summary::-webkit-details-marker {
		display: unset;
	}

	details[open] {
		summary > :global(svg) {
			transform: rotate(90deg);
		}
	}
</style>
