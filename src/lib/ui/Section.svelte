<script lang="ts">
	import type { Snippet } from 'svelte';
	import Checkbox from './Checkbox.svelte';
	import { edits } from '$lib/state/editing.svelte';
	import { IconChevronRight } from '@tabler/icons-svelte';

	interface Props {
		title: string;
		section: string;
		children: Snippet<[]>;
		enabledKey?: string;
	}

	let { title, section, children, enabledKey = 'Enabled' }: Props = $props();
</script>

<details class="border-b border-neutral-700/50">
	<summary class="mb-1 flex cursor-pointer items-center rounded-lg bg-neutral-800 px-4 py-2 select-none">
		<IconChevronRight class="mr-2 shrink-0" />
		<Checkbox label={title} bind:checked={edits.pp3[section][enabledKey] as boolean} small></Checkbox>
	</summary>
	<div class="flex flex-col gap-2 px-4 py-2" class:opacity-70={!edits.pp3[section][enabledKey]}>
		{@render children()}
	</div>
</details>

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
