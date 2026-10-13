<script lang="ts">
	import type { Snippet } from 'svelte';
	import Checkbox from './Checkbox.svelte';
	import { edits } from '$lib/state/editing.svelte';
	import AdjustmentIcon from './AdjustmentIcon.svelte';

	interface Props {
		title: string;
		section: string;
		children: Snippet<[]>;
		enabledKey?: string;
		showToggle?: boolean;
		groupId?: string;
	}

	let { title, section, children, enabledKey = 'Enabled', showToggle = true, groupId }: Props = $props();

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

	function handleSummaryClick(event: MouseEvent) {
		if (!window.matchMedia('(max-width: 1023px)').matches) return;
		const summary = event.currentTarget as HTMLElement;
		const details = summary.closest('details');
		if (!details || details.open) return;
		const group = details.closest('[data-adjustment-sections]');
		group?.querySelectorAll<HTMLDetailsElement>('details[open]').forEach((other) => {
			if (other !== details) other.open = false;
		});
	}

	function handleToggle(event: Event) {
		if (!window.matchMedia('(max-width: 1023px)').matches) return;
		const details = event.currentTarget as HTMLDetailsElement;
		if (!details.open) return;
		const scroller = details.closest<HTMLElement>('[data-adjustment-scroll]');
		if (!scroller) return;
		// Leave enough trailing space for even the last short section to reach the top.
		scroller.style.paddingBottom = `${Math.max(16, scroller.clientHeight - details.offsetHeight)}px`;
		const top = scroller.scrollTop + details.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
		scroller.scrollTo({ top: Math.max(0, top), behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
	}

</script>

<div class="relative mb-1">
	<details class="" data-adjustment-group={groupId} ontoggle={handleToggle}>
		<summary onclick={handleSummaryClick} class="mb-1 flex cursor-pointer items-center rounded-lg bg-neutral-800 px-4 py-2 pr-14 select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-300">
			<AdjustmentIcon name={title} />
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
	summary {
		list-style: none;
		transition: background-color 150ms;
	}
	summary:hover { background-color: #303030; }
	details summary::-webkit-details-marker {
		display: none;
	}
	details[open] > summary {
		background-color: #f5f5f5;
	}
	details[open] > summary:hover { background-color: #e5e5e5; }
	details[open] > summary :global(svg) { color: #262626; }
	details[open] > summary > span { color: #171717; }
	@media (prefers-reduced-motion: reduce) { summary { transition: none; } }
</style>
