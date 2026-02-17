<script lang="ts">
	import { tagStore } from "$lib/state/tag.svelte";
	import { slide } from "svelte/transition";


	function handleSuggestionClick(tag: string) {
		tagStore.addTag(tag);
		document.getElementById('tag-input')?.focus();
	}
</script>

<!-- Suggestions Dropdown -->
{#if tagStore.showSuggestions && tagStore.filteredTags.length > 0}
	<ul
		transition:slide={{ duration: 150 }}
		class="ring-opacity-5 z-10 mt-1 max-h-24 w-full overflow-auto rounded-md border border-neutral-300 bg-black text-base text-white shadow-lg ring-1 ring-black focus:outline-none sm:text-sm"
	>
		{#each tagStore.filteredTags as tag, index (tag)}
			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
			<li
				class="relative cursor-pointer px-3 py-2 select-none hover:bg-neutral-700 {tagStore.activeSuggestionIndex === index ? 'bg-neutral-800' : ''}"
				onclick={() => handleSuggestionClick(tag)}
				onmouseenter={() => (tagStore.activeSuggestionIndex = index)}
			>
				{tag}
			</li>
		{/each}
	</ul>
{/if}

<style>
	ul {
		position: fixed;
		position-anchor: --tag-input-anchor;
		top: anchor(bottom);
		left: anchor(left);
		width: anchor-size(width);
		z-index: 1000;
	}
</style>
