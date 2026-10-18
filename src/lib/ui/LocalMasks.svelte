<script lang="ts">
	import { edits } from '$lib/state/editing.svelte';
	import { maskIndices, addLocalMask, deleteLocalMask } from '$lib/local-masks';
	import Slider from './Slider.svelte';
	import IconPlus from '@tabler/icons-svelte/icons/plus';
	import IconTrash from '@tabler/icons-svelte/icons/trash';
	import IconDots from '@tabler/icons-svelte/icons/dots';
	import IconPower from '@tabler/icons-svelte/icons/power';
	let menu = $state<HTMLDetailsElement>();
	let { onadd }: { onadd?: () => void } = $props();
	const indices = $derived(maskIndices(edits.pp3));
	const selected = $derived(indices.includes(Number(edits.pp3.Locallab.Selspot)) ? Number(edits.pp3.Locallab.Selspot) : indices[0]);
	function changed() {
		edits.pp3.Locallab.Enabled = true;
		edits.pushHistory();
	}
</script>

<svelte:window
	onpointerdown={(event) => {
		if (menu && !menu.contains(event.target as Node)) menu.open = false;
	}}
	onkeydown={(event) => {
		if (event.key === 'Escape' && menu) menu.open = false;
	}}
/>
<div class="space-y-3">
	<div class="flex items-center gap-1 rounded-lg bg-neutral-900/70">
		<button
			type="button"
			class="mask-action"
			aria-label="Add mask"
			title="Add mask"
			onclick={() => {
				addLocalMask(edits.pp3, 'ELI');
				edits.pushHistory(true);
				onadd?.();
			}}><IconPlus size={20} /></button
		>
		{#if indices.length}
			<select
				class="min-w-0 flex-1"
				aria-label="Selected mask"
				value={selected}
				onchange={(event) => {
					edits.pp3.Locallab.Selspot = Number(event.currentTarget.value);
					if (menu) menu.open = false;
				}}
			>
				{#each indices as index}<option value={index}>{edits.pp3.Locallab[`Name_${index}`]}</option>{/each}
			</select>
			<button
				type="button"
				class="mask-action"
				aria-label="Enable this mask"
				aria-pressed={!!edits.pp3.Locallab[`Activ_${selected}`]}
				title="Enable this mask"
				onclick={() => {
					edits.pp3.Locallab[`Activ_${selected}`] = !edits.pp3.Locallab[`Activ_${selected}`];
					edits.pushHistory(true);
				}}><IconPower size={18} /></button
			>
			<details bind:this={menu} class="relative shrink-0">
				<summary class="mask-action cursor-pointer list-none" aria-label="Mask actions"><IconDots size={18} /></summary>
				<div class="absolute top-full right-0 z-40 mt-1 w-44 rounded-lg border border-neutral-700 bg-neutral-950 p-1 shadow-xl">
					<button
						type="button"
						class="flex min-h-11 w-full items-center gap-2 rounded px-3 text-xs hover:bg-neutral-800"
						onclick={() => {
							if (menu) menu.open = false;
							deleteLocalMask(edits.pp3, selected);
							edits.pushHistory(true);
						}}><IconTrash size={16} />Delete mask</button
					>
				</div>
			</details>
		{/if}
	</div>
	{#if selected !== undefined}
		{#key selected}
			<div class="space-y-3 border-b border-neutral-800 pb-3">
				<select
					aria-label="Mask shape"
					value={edits.pp3.Locallab[`Shape_${selected}`] as string}
					onchange={(event) => {
						edits.pp3.Locallab[`Shape_${selected}`] = event.currentTarget.value;
						changed();
					}}><option value="ELI">Ellipse</option><option value="RECT">Rectangle</option></select
				>
				<Slider editable label="Feather" bind:value={edits.pp3.Locallab[`Feather_${selected}`] as number} min={0} max={100} step={1} resetValue={25} onchange={changed} />
			</div>
			<Slider
				editable
				label="Exposure"
				bind:value={edits.pp3.Locallab[`Expcomp_${selected}`] as number}
				min={-1}
				max={1}
				step={0.01}
				precision={2}
				centered
				resetValue={0}
				unit=" EV"
				onchange={changed}
			/>
			{#each [{ key: 'Lightness', label: 'Brightness' }, { key: 'Contrast', label: 'Contrast' }, { key: 'Chroma', label: 'Saturation' }] as control}
				<Slider
					editable
					label={control.label}
					bind:value={edits.pp3.Locallab[`${control.key}_${selected}`] as number}
					min={-100}
					max={100}
					step={1}
					centered
					resetValue={0}
					onchange={changed}
				/>
			{/each}
		{/key}
	{/if}
</div>

<style>
	select {
		min-height: 44px;
		width: 100%;
		padding: 0 8px;
		background: #171717;
		color: #e5e5e5;
		border-radius: 6px;
		font-size: 12px;
	}
	select:focus-visible {
		outline: 2px solid white;
		outline-offset: -2px;
	}
	.mask-action[aria-pressed='true'] {
		color: #fff;
		background: #404040;
	}
	.mask-action[aria-pressed='false'] {
		color: #737373;
	}
	summary::-webkit-details-marker {
		display: none;
	}
	.mask-action {
		display: flex;
		min-height: 44px;
		min-width: 44px;
		flex-shrink: 0;
		align-items: center;
		justify-content: center;
		border-radius: 9999px;
		color: #d4d4d4;
	}
	.mask-action:hover {
		background: #262626;
		color: #fff;
	}
	.mask-action:focus-visible {
		outline: 2px solid #fff;
		outline-offset: 2px;
	}
</style>
