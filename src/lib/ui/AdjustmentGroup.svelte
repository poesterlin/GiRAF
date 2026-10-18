<script lang="ts">
	import type { Snippet } from 'svelte';
	import Section from './Section.svelte';
	import { edits } from '$lib/state/editing.svelte';
	import { page } from '$app/state';
	let { title, group, checked, onchange, children }: { title: string; group: string; checked?: boolean; onchange?: (value: boolean) => void; children: Snippet } = $props();
	// Masks are not documents, so a caller can own the toggle instead of the disabled-group list
	const enabled = $derived(checked ?? !edits.disabledGroups.includes(group));
	function toggle() {
		if (onchange) onchange(!enabled);
		else edits.toggleGroup(group);
	}
</script>

{#if checked !== undefined || !page.data.hiddenAdjustmentCategories?.includes(group)}
	<div class="adjustment-group relative">
		<Section {title} section="" showToggle={false} groupId={group}>
			<fieldset class="min-w-0 space-y-3 border-0 p-0" class:opacity-50={!enabled}>
				{@render children()}
			</fieldset>
		</Section>
		<button
			type="button"
			class="bypass absolute top-0 right-2 flex h-11 w-11 items-center justify-center rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400"
			aria-label={`Enable ${title}`}
			aria-pressed={enabled}
			title={enabled ? `Turn ${title} off` : `Enable ${title}`}
			onclick={toggle}
		>
			<span class="flex h-7 w-7 items-center justify-center" class:opacity-40={!enabled}>
				<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
					<path d="M12 3v9M7 5.5a8 8 0 1 0 10 0" />
					{#if !enabled}<path d="m4 4 16 16" />{/if}
				</svg>
			</span>
		</button>
	</div>
{/if}

<style>
	.bypass {
		color: #a3a3a3;
		transition: color 150ms;
	}
	.bypass:hover {
		color: #f5f5f5;
	}
	.adjustment-group:has(:global(details[open])) > .bypass {
		color: #262626;
	}
	.adjustment-group:has(:global(details[open])) > .bypass:hover {
		color: #000;
	}
	@media (prefers-reduced-motion: reduce) {
		.bypass {
			transition: none;
		}
	}
</style>
