<script lang="ts">
	import { IconX } from '@tabler/icons-svelte';
	import TagSuggestions from './TagSuggestions.svelte';
	import { fly } from 'svelte/transition';
	import { tagStore } from '$lib/state/tag.svelte';
	import { stopPropagation } from './utils';

	interface Props {
		name?: string;
		placeholder?: string;
		label?: string;
		onTagsChange?: (tags: string[]) => void;
	}

	let {
		name = 'tags',
		placeholder = 'Add tags...',
		label = 'Tags',
		onTagsChange
	}: Props = $props();

	// Call onTagsChange when tagStore.selected changes
	$effect(() => {
		onTagsChange?.(tagStore.selected);
	});

	function focusInput() {
		document.getElementById('tag-input')?.focus();
	}
</script>

<div class="tag-input-wrapper relative">
	<label for="tag-input" class="block text-sm font-medium text-gray-700 dark:text-gray-200">
		{label}
	</label>
	<!-- svelte-ignore a11y_no_abstract_role -->
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<div
		role="input"
		id="input-wrapper"
		class="input mt-1 flex w-full flex-wrap items-center gap-1 p-1"
		onclick={focusInput}
	>
		{#each tagStore.selected as tag (tag)}
			{#if tag}
				<span
					transition:fly={{ x: -20 }}
					class="flex items-center rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-800"
				>
					{tag}
					<button
						type="button"
						class="ml-1 flex-shrink-0 rounded-full p-0.5 text-neutral-600 hover:bg-neutral-200 hover:text-neutral-900 focus:ring-2 focus:ring-neutral-500 focus:outline-none"
						onclick={stopPropagation(() => tagStore.removeTag(tag))}
						aria-label={`Remove ${tag} tag`}
					>
						<IconX class="h-3 w-3" />
					</button>
				</span>
			{/if}
		{/each}
		<input
			type="text"
			id="tag-input"
			bind:value={tagStore.tagInput}
			oninput={(e) => tagStore.handleTagInputChange(e)}
			onkeydown={(e) => tagStore.handleTagInputKeydown(e)}
			class="min-w-[60px] flex-grow border-none bg-transparent p-1 text-sm focus:ring-0 focus:outline-none"
			placeholder={tagStore.selected.length === 0 ? placeholder : ''}
			autocomplete="off"
		/>
	</div>

	<TagSuggestions></TagSuggestions>

	<!-- Hidden input to tagStore the final comma-separated value -->
	<input type="hidden" {name} value={tagStore.selected.join(',')} />
</div>

<style>
	#input-wrapper {
		anchor-name: --tag-input-anchor;
	}
</style>
