<script lang="ts">
	import { edits } from '$lib/state/editing.svelte';
	import { maskIndices, addLocalMask, deleteLocalMask } from '$lib/local-masks';
	import Slider from './Slider.svelte';
	import IconPlus from '@tabler/icons-svelte/icons/plus';
	import IconTrash from '@tabler/icons-svelte/icons/trash';
	import Checkbox from './Checkbox.svelte';
	import Select from './Select.svelte';
	let { onadd }: { onadd?: () => void } = $props();
	const indices = $derived(maskIndices(edits.pp3));
	const selected = $derived(indices.includes(Number(edits.pp3.Locallab.Selspot)) ? Number(edits.pp3.Locallab.Selspot) : indices[0]);
	function changed() { edits.pp3.Locallab.Enabled = true; edits.pushHistory(); }
</script>

<div class="space-y-3 mb-5">
	<div class="flex items-center gap-2 rounded-2xl bg-neutral-900/70 p-1">
		<button type="button" class="mask-action" aria-label="Add mask" title="Add mask" onclick={() => { addLocalMask(edits.pp3, 'ELI'); edits.pushHistory(true); onadd?.(); }}><IconPlus size={20} /></button>
		{#if indices.length}
			<div class="min-w-0 flex-1"><Select ariaLabel="Selected mask" value={String(selected)} options={Object.fromEntries(indices.map(index => [String(index), String(edits.pp3.Locallab[`Name_${index}`])]))} onchange={(value) => { if (value !== null) edits.pp3.Locallab.Selspot = Number(value); }} /></div>
			<button type="button" class="mask-action" aria-label="Delete selected mask" title="Delete selected mask" onclick={() => { deleteLocalMask(edits.pp3, selected); edits.pushHistory(true); }}><IconTrash size={20} /></button>
		{/if}
	</div>
	{#if selected !== undefined}
		{#key selected}
		<Checkbox label="Enable this mask" bind:checked={edits.pp3.Locallab[`Activ_${selected}`] as boolean} onchange={() => edits.pushHistory(true)} />
		<Select ariaLabel="Mask shape" value={edits.pp3.Locallab[`Shape_${selected}`] as string} options={{ ELI: 'Ellipse', RECT: 'Rectangle' }} onchange={(value) => { if (value) edits.pp3.Locallab[`Shape_${selected}`] = value; changed(); }} />
		<Slider label="Feather" bind:value={edits.pp3.Locallab[`Feather_${selected}`] as number} min={0} max={100} step={1} resetValue={25} onchange={changed} />
		<Slider label="Exposure" bind:value={edits.pp3.Locallab[`Expcomp_${selected}`] as number} min={-1} max={1} step={0.05} precision={2} centered resetValue={0} unit=" EV" onchange={changed} />
		{#each [{ key: 'Lightness', label: 'Brightness' }, { key: 'Contrast', label: 'Contrast' }, { key: 'Chroma', label: 'Saturation' }] as control}
			<Slider label={control.label} bind:value={edits.pp3.Locallab[`${control.key}_${selected}`] as number} min={-100} max={100} step={1} centered resetValue={0} onchange={changed} />
		{/each}
		{/key}
	{/if}
</div>

<style>
	.mask-action { display: flex; min-height: 44px; min-width: 44px; flex-shrink: 0; align-items: center; justify-content: center; border-radius: 9999px; color: #d4d4d4; }
	.mask-action:hover { background: #262626; color: #fff; }
	.mask-action:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
</style>
