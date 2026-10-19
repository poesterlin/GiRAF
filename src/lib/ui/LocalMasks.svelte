<script lang="ts">
	import { edits } from '$lib/state/editing.svelte';
	import {
		maskIndices,
		addLocalMask,
		deleteLocalMask,
		maskTools,
		setMaskToolEnabled,
		gradientControls,
		isGradientMask,
		maskKind,
		setMaskKind,
		maskColourRange,
		setMaskColourRange,
		maskInverted,
		setMaskInverted,
		type MaskKind,
		type MaskTool,
		type MaskToolControl
	} from '$lib/local-masks';
	import AdjustmentGroup from './AdjustmentGroup.svelte';
	import Checkbox from './Checkbox.svelte';
	import { showMaskRange } from '$lib/state/mask-range.svelte';
	import Slider from './Slider.svelte';
	import IconPlus from '@tabler/icons-svelte/icons/plus';
	import IconTrash from '@tabler/icons-svelte/icons/trash';
	import IconDots from '@tabler/icons-svelte/icons/dots';
	import IconPower from '@tabler/icons-svelte/icons/power';
	let menu = $state<HTMLDetailsElement>();
	let { onadd }: { onadd?: () => void } = $props();
	const indices = $derived(maskIndices(edits.pp3));
	const selected = $derived(indices.includes(Number(edits.pp3.Locallab.Selspot)) ? Number(edits.pp3.Locallab.Selspot) : indices[0]);
	const gradient = $derived(selected !== undefined && isGradientMask(edits.pp3, selected));
	function add() {
		addLocalMask(edits.pp3, 'ELI');
		edits.pushHistory(true);
		onadd?.();
	}
	function changed() {
		edits.pp3.Locallab.Enabled = true;
		edits.pushHistory();
	}
	function toolEnabled(tool: MaskTool) {
		return !!edits.pp3.Locallab[`${tool.enable}_${selected}`];
	}
	/** Moving one of a tool's sliders turns the tool on, the way the other panels work. */
	function toolChanged(tool: MaskTool) {
		setMaskToolEnabled(edits.pp3, selected, tool, true);
		changed();
	}
	function setTool(tool: MaskTool, enabled: boolean) {
		setMaskToolEnabled(edits.pp3, selected, tool, enabled);
		edits.pushHistory(true);
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
{#snippet gradientSlider(control: MaskToolControl)}
	{@const key = `${control.key}_${selected}`}
	{@const sign = control.invert ? -1 : 1}
	<Slider
		editable
		label={control.label}
		bind:value={() => sign * Number(edits.pp3.Locallab[key] ?? 0), (value) => (edits.pp3.Locallab[key] = sign * value)}
		min={control.min}
		max={control.max}
		step={control.step ?? 1}
		precision={control.precision}
		centered={control.centered}
		resetValue={sign * control.reset}
		unit={control.unit}
		onchange={changed}
	/>
{/snippet}

<div class="space-y-3">
	<div class="flex items-center gap-1 rounded-lg bg-neutral-900/70">
		<button type="button" class="mask-action" aria-label="Add mask" title="Add mask" onclick={add}><IconPlus size={20} /></button>
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
				{#each indices as index (index)}<option value={index}>{edits.pp3.Locallab[`Name_${index}`]}</option>{/each}
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
					aria-label="Mask type"
					value={maskKind(edits.pp3, selected)}
					onchange={(event) => {
						setMaskKind(edits.pp3, selected, event.currentTarget.value as MaskKind);
						edits.pp3.Locallab.Enabled = true;
						edits.pushHistory(true);
					}}><option value="ELI">Ellipse</option><option value="RECT">Rectangle</option><option value="GRADIENT">Gradient</option></select
				>
				{#if gradient}
					{#each gradientControls.filter((control) => control.shape) as control (control.key)}{@render gradientSlider(control)}{/each}
				{:else}
					<Slider editable label="Feather" bind:value={edits.pp3.Locallab[`Feather_${selected}`] as number} min={0} max={100} step={1} resetValue={25} onchange={changed} />
					<Slider
						editable
						label="Colour range"
						bind:value={
							() => maskColourRange(edits.pp3, selected),
							(value) => {
								setMaskColourRange(edits.pp3, selected, value);
								showMaskRange();
							}
						}
						min={0}
						max={100}
						step={1}
						resetValue={100}
						onchange={changed}
					/>
					<Checkbox
						label="Invert"
						checked={maskInverted(edits.pp3, selected)}
						onchange={(inverted) => {
							setMaskInverted(edits.pp3, selected, inverted);
							edits.pp3.Locallab.Enabled = true;
							edits.pushHistory(true);
						}}
					/>
					{#if maskInverted(edits.pp3, selected)}
						<p class="px-1 text-xs leading-relaxed text-neutral-500">Warm &amp; colour and Clarity can’t be inverted, so they’re hidden.</p>
					{/if}
				{/if}
			</div>
			{#if gradient}
				{#each gradientControls.filter((control) => !control.shape) as control (control.key)}{@render gradientSlider(control)}{/each}
			{:else}
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
			{/if}
			{#each [{ key: 'Lightness', label: 'Brightness' }, { key: 'Contrast', label: 'Contrast' }, { key: 'Chroma', label: 'Saturation' }] as control (control.key)}
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
			<!-- Warm & colour and Clarity can't be inverted in RawTherapee, so an inverted mask doesn't offer them -->
			{#each maskTools.filter((tool) => tool.invert || !maskInverted(edits.pp3, selected)) as tool (tool.enable)}
				<AdjustmentGroup title={tool.label} group={tool.enable} checked={toolEnabled(tool)} onchange={(enabled) => setTool(tool, enabled)}>
					{#each tool.controls as control (control.key)}
						<Slider
							editable
							label={control.label}
							bind:value={edits.pp3.Locallab[`${control.key}_${selected}`] as number}
							min={control.min}
							max={control.max}
							step={control.step ?? 1}
							precision={control.precision}
							centered={control.centered}
							resetValue={control.reset}
							unit={control.unit}
							onchange={() => toolChanged(tool)}
						/>
					{/each}
				</AdjustmentGroup>
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
