<script lang="ts">
	import { tick } from 'svelte';
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import type { SubmitFunction } from '@sveltejs/kit';
	import Checkbox from '$lib/ui/Checkbox.svelte';
	import { adjustmentCategories, hiddenAdjustmentCategories } from '$lib/adjustment-categories';
	let { data } = $props();

	let triageEnabled = $derived(data.settings.triage_enabled !== 'false');
	let form = $state<HTMLFormElement>();
	let categoryForm = $state<HTMLFormElement>();
	let visibleCategories = $state(
		adjustmentCategories.filter((category) => !hiddenAdjustmentCategories(data.settings.hidden_adjustment_categories ?? '').includes(category.id)).map((category) => category.id)
	);
	let savingCategories = $state(false);
	let categoriesPending = false;
	let categoryError = $state(false);

	function saveCategories() {
		if (savingCategories) {
			categoriesPending = true;
			return;
		}
		categoryForm?.requestSubmit();
	}

	const enhanceCategories: SubmitFunction = () => {
		savingCategories = true;
		categoryError = false;
		return async ({ result }) => {
			savingCategories = false;
			categoryError = result.type !== 'success';
			if (categoriesPending) {
				categoriesPending = false;
				saveCategories();
			} else if (!categoryError) {
				await invalidateAll();
			}
		};
	};
</script>

<div class="flex h-full justify-center overflow-y-auto px-4 py-6" style="accent-color: #e5e5e5">
	<div class="w-full max-w-md">
		<div class="rounded-lg border border-neutral-800 bg-neutral-900 p-6">
			<h1 class="mb-6 text-center text-2xl font-bold">Settings</h1>

			<form method="POST" action="?/update" use:enhance bind:this={form}>
				<div class="flex flex-col gap-1 py-3">
					<Checkbox label="Triage Step" name="triage_enabled" bind:checked={triageEnabled} onchange={() => form?.requestSubmit()} />
					<div class="pr-16 text-sm text-neutral-400">Enable or disable the Triage view.</div>
				</div>
			</form>
		</div>
		<div class="mt-6 rounded-lg border border-neutral-800 bg-neutral-900 p-6">
			<div class="mb-4 flex items-center justify-between gap-3">
				<h2 class="text-lg font-bold">Adjustment categories</h2>
				<button
					type="button"
					disabled={visibleCategories.length === adjustmentCategories.length}
					onclick={() => {
						visibleCategories = adjustmentCategories.map((category) => category.id);
						// Submit after Svelte updates the checkbox inputs.
						tick().then(saveCategories);
					}}
					class="rounded-md border border-neutral-700 px-3 py-2 text-sm hover:bg-neutral-800 disabled:opacity-40">Enable all</button
				>
			</div>
			<form method="POST" action="?/categories" use:enhance={enhanceCategories} bind:this={categoryForm} class="space-y-3">
				{#each adjustmentCategories as category}
					<label class="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
						<input type="checkbox" name="visible_category" value={category.id} bind:group={visibleCategories} onchange={saveCategories} class="h-4 w-4 accent-neutral-200" />
						{category.label}
					</label>
				{/each}
				{#if categoryError}<button type="button" onclick={saveCategories} class="text-sm underline">Couldn’t save. Retry</button>{/if}
			</form>
		</div>

		<div class="mt-12 rounded-lg border border-neutral-800 bg-neutral-900 p-6 text-center">
			<h1 class="mb-4 text-2xl font-bold">Legal</h1>
			<a href="/legal" class="underline">Licenses and more</a>
		</div>
	</div>
</div>
