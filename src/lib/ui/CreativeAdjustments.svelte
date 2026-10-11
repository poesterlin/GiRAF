<script lang="ts">
	import { edits } from '$lib/state/editing.svelte';
	import { creativeDefaults, toneColor, setToneColor, enableMonochromeMixer, type ToneRange } from '$lib/creative-adjustments';
	import Slider from './Slider.svelte';
	import Checkbox from './Checkbox.svelte';
	import Select from './Select.svelte';
	import Button from './Button.svelte';
	import ColorWheel from './ColorWheel.svelte';
	let { mode }: { mode: 'grading' | 'monochrome' } = $props();
	function colorChange(range: ToneRange, hue: number, saturation: number) {
		setToneColor(edits.pp3, range, hue, saturation);
		edits.pushHistory();
	}
	const gradingIgnored = $derived(edits.pp3.ColorToning.Enabled === false && (toneColor(edits.pp3, 'Shadows').saturation !== 0 || toneColor(edits.pp3, 'Highlights').saturation !== 0));
</script>

{#if mode === 'grading'}
	{#each ['Shadows', 'Highlights'] as range}
		{@const color = toneColor(edits.pp3, range as ToneRange)}
		<div class="space-y-3">
			<div class="flex min-h-9 items-center gap-2 text-xs font-semibold uppercase tracking-wider text-neutral-300">
				<span class="h-3 w-3 rounded-full ring-1 ring-white/20" style:background-color={`hsl(${color.hue} 100% 55%)`} aria-hidden="true"></span>{range}
			</div>
			<ColorWheel label={`${range} color`} hue={color.hue} saturation={color.saturation} ignored={gradingIgnored} onchange={(hue) => colorChange(range as ToneRange, hue, color.saturation)} />
			<Slider
				label={`${range} saturation`}
				value={color.saturation}
				min={0}
				max={100}
				step={1}
				precision={0}
				resetValue={0}
				ignored={gradingIgnored}
				onchange={(saturation) => colorChange(range as ToneRange, color.hue, saturation)}
			/>
		</div>
	{/each}
	<Slider
		label="Balance"
		bind:value={edits.pp3.ColorToning.Balance as number}
		map={(value) => -value}
		inverseMap={(value) => -value}
		displayValue={(value) => -value}
		min={-100}
		max={100}
		step={1}
		centered
		resetValue={0}
		ignored={gradingIgnored}
		onchange={() => {
			edits.pp3.ColorToning.Enabled = true;
			edits.pp3.ColorToning.Method = 'Splitlr';
			edits.pushHistory();
		}}
	/>
	<Slider
		label="Strength"
		bind:value={edits.pp3.ColorToning.Strength as number}
		min={0}
		max={100}
		step={1}
		resetValue={100}
		ignored={gradingIgnored}
		onchange={() => {
			edits.pp3.ColorToning.Enabled = true;
			edits.pp3.ColorToning.Method = 'Splitlr';
			edits.pushHistory();
		}}
	/>
	<Button
		onclick={() => {
			Object.assign(edits.pp3.ColorToning, creativeDefaults.ColorToning);
			edits.pp3.ColorToning.Enabled = true;
			edits.pushHistory(true);
		}}>Reset grading</Button
	>
{:else}
	<Checkbox
		label="Monochrome"
		checked={edits.pp3['Black_&_White'].Enabled as boolean}
		onchange={(enabled) => {
			if (enabled) enableMonochromeMixer(edits.pp3);
			else edits.pp3['Black_&_White'].Enabled = false;
			edits.pushHistory(true);
		}}
	/>
	<Select
		ariaLabel="Black and white filter"
		value={edits.pp3['Black_&_White'].Filter as string}
		options={{ None: 'No filter', Red: 'Red filter', Orange: 'Orange filter', Yellow: 'Yellow filter', Green: 'Green filter', Blue: 'Blue filter' }}
		onchange={(filter) => {
			if (!filter) return;
			edits.pp3['Black_&_White'].Filter = filter;
			enableMonochromeMixer(edits.pp3);
			edits.pushHistory(true);
		}}
	/>
	{#each ['Red', 'Green', 'Blue'] as channel}
		<Slider
			label={`${channel} brightness`}
			bind:value={edits.pp3['Black_&_White'][`Mixer${channel}`] as number}
			min={0}
			max={100}
			step={1}
			precision={0}
			resetValue={33}
			ignored={!edits.pp3['Black_&_White'].Enabled as boolean}
			onchange={() => {
				enableMonochromeMixer(edits.pp3);
				edits.pushHistory();
			}}
		/>
	{/each}
	<Button
		onclick={() => {
			Object.assign(edits.pp3['Black_&_White'], { MixerRed: 33, MixerGreen: 33, MixerBlue: 33, Filter: 'None' });
			edits.pushHistory(true);
		}}>Reset mixer</Button
	>
{/if}
