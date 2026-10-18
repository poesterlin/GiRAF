<script lang="ts">
	import { tick, untrack } from 'svelte';
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import type { SubmitFunction } from '@sveltejs/kit';
	import Checkbox from '$lib/ui/Checkbox.svelte';
	import { adjustmentCategories, hiddenAdjustmentCategories } from '$lib/adjustment-categories';
	import { MAX_EXPORT_LONG_EDGE } from '$lib/export-settings';
	let { data } = $props();

	let triageEnabled = $derived(data.settings.triage_enabled !== 'false');
	let form = $state<HTMLFormElement>();
	let categoryForm = $state<HTMLFormElement>();
	let visibleCategories = $state(
		adjustmentCategories.filter((category) => !hiddenAdjustmentCategories(data.settings.hidden_adjustment_categories ?? '').includes(category.id)).map((category) => category.id)
	);
	let exportForm = $state<HTMLFormElement>();
	// The form owns these after load; saving doesn't reload them
	const savedExport = untrack(() => data.exportSettings);
	let exportQuality = $state(savedExport.quality);
	// Empty means full size
	let exportLongEdge = $state<number | null>(savedExport.longEdge || null);
	let exportStatus = $state<'idle' | 'saving' | 'saved' | 'error'>('idle');

	const enhanceExport: SubmitFunction = () => {
		exportStatus = 'saving';
		return async ({ result }) => {
			exportStatus = result.type === 'success' ? 'saved' : 'error';
		};
	};
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
			<div class="mb-1 flex items-center justify-between gap-3">
				<h2 class="text-lg font-bold">Export</h2>
				<span class="text-sm text-neutral-400" aria-live="polite">
					{#if exportStatus === 'saving'}Saving…{:else if exportStatus === 'saved'}Saved{:else if exportStatus === 'error'}Couldn’t save{/if}
				</span>
			</div>
			<p class="mb-4 text-sm text-neutral-400">Used for every export. Changing them exports each session again the next time you export it.</p>
			<form method="POST" action="?/export" use:enhance={enhanceExport} bind:this={exportForm} class="space-y-4">
				<label class="flex flex-col gap-1 text-sm">
					<span class="flex justify-between">JPEG quality <span class="text-neutral-400 tabular-nums">{exportQuality}</span></span>
					<input type="range" name="quality" min="50" max="100" step="1" bind:value={exportQuality} onchange={() => exportForm?.requestSubmit()} class="min-h-11" />
				</label>
				<label class="flex flex-col gap-1 text-sm">
					Long edge in pixels
					<input
						type="number"
						name="long_edge"
						min="0"
						max={MAX_EXPORT_LONG_EDGE}
						step="1"
						inputmode="numeric"
						placeholder="Full size"
						bind:value={exportLongEdge}
						onchange={() => exportForm?.requestSubmit()}
						class="min-h-11 rounded-md border border-neutral-700 bg-neutral-950 px-3 text-neutral-100 tabular-nums"
					/>
					<span class="text-neutral-400">Leave empty for full size. Photos are never enlarged.</span>
				</label>
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
				{#each adjustmentCategories as category (category.id)}
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
