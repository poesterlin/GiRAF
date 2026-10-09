<script lang="ts">
	import { map } from '$lib';
	import { filterPP3, setLut, toBase64 } from '$lib/pp3-utils';
	import type { Image, Snapshot } from '$lib/server/db/schema';
	import { edits } from '$lib/state/editing.svelte';
	import Button from '$lib/ui/Button.svelte';
	import Checkbox from '$lib/ui/Checkbox.svelte';
	import AdjustmentGroup from '$lib/ui/AdjustmentGroup.svelte';
	import Select from '$lib/ui/Select.svelte';
	import Slider from '$lib/ui/Slider.svelte';
	import ColorAdjustments from '$lib/ui/ColorAdjustments.svelte';
	import AdjustmentSubsection from '$lib/ui/AdjustmentSubsection.svelte';
	import { blackLevelFromPP3, blackLevelToPP3 } from '$lib/black-level';

	interface Props {
		data: { image: Image; snapshots: Snapshot[] };
		showLutPicker: boolean;
	}

	let { data, showLutPicker = $bindable() }: Props = $props();

	let apiPath = $derived(`/api/images/${data.image?.id}`);

	function lutPathToName(path: string) {
		// Convert the LUT path to a user-friendly name
		return path.split('/').pop()?.replace('.png', '');
	}
</script>

<section class="control-section" data-adjustment-sections>
	<AdjustmentGroup title="White Balance" group="whiteBalance">
		<Select
			ariaLabel="White Balance"
			options={{ Camera: 'Camera', Daylight: 'Daylight', Shade: 'Shade', Cloudy: 'Cloudy', Custom: 'Custom' }}
			onchange={(value) => {
				const img = data.image;
				if (value === 'Camera' && img.whiteBalance && img.tint) {
					edits.pp3.White_Balance.Temperature = img.whiteBalance;
					edits.pp3.White_Balance.Green = img.tint;
				}
				edits.pushHistory();
			}}
			bind:value={edits.pp3.White_Balance.Setting as string}
		/>
		{#if edits.pp3.White_Balance.Temperature && edits.pp3.White_Balance.Green}
			<Slider
				label="Temperature"
				bind:value={edits.pp3.White_Balance.Temperature as number}
				min={-3000} max={3000} step={1} centered
				resetValue={data.image.whiteBalance!}
				ignored={edits.pp3.White_Balance.Setting !== 'Custom'}
				onchange={() => { edits.pp3.White_Balance.Setting = 'Custom'; edits.pushHistory(); }}
				overlay="bg-gradient-to-r from-[#0000FF] to-[#FFFF00]"
				map={(x) => map(x, -3000, 3000, data.image.whiteBalance! - 3000, data.image.whiteBalance! + 3000)}
				inverseMap={(y) => map(y, data.image.whiteBalance! - 3000, data.image.whiteBalance! + 3000, -3000, 3000)}
			/>
			<Slider
				label="Tint"
				overlay="bg-gradient-to-r from-[#FF00FF] to-[#00FF00]"
				bind:value={edits.pp3.White_Balance.Green as number}
				min={-100} max={100} step={0.001} centered precision={3}
				resetValue={data.image.tint ?? 1}
				ignored={edits.pp3.White_Balance.Setting !== 'Custom'}
				onchange={() => { edits.pp3.White_Balance.Setting = 'Custom'; edits.pushHistory(); }}
				map={(x) => map(x, -100, 100, 0.5, 1.5)}
				inverseMap={(y) => map(y, 0.5, 1.5, -100, 100)}
			/>
		{/if}
	</AdjustmentGroup>
	<AdjustmentGroup title="Light" group="exposure">
		<Checkbox label="Auto Exposure" bind:checked={edits.pp3.Exposure.Auto as boolean} onchange={() => edits.pushHistory()} />
		<Slider
			label="Exposure"
			bind:value={edits.pp3.Exposure.Compensation as number}
			min={-5}
			max={5}
			step={0.01}
			centered
			ignored={edits.pp3.Exposure.Auto as boolean}
			onchange={() => { edits.pp3.Exposure.Auto = false; edits.pushHistory(); }}
		/>
		<Slider
			label="Brightness"
			bind:value={edits.pp3.Exposure.Brightness as number}
			centered
			ignored={edits.pp3.Exposure.Auto as boolean}
			onchange={() => { edits.pp3.Exposure.Auto = false; edits.pushHistory(); }}
		/>
		<Slider
			label="Contrast"
			bind:value={edits.pp3.Exposure.Contrast as number}
			centered
			ignored={edits.pp3.Exposure.Auto as boolean}
			onchange={() => { edits.pp3.Exposure.Auto = false; edits.pushHistory(); }}
		/>

		<Slider
			label="Black Level"
			bind:value={edits.pp3.Exposure.Black as number}
			min={-50}
			max={100}
			step={0.1}
			map={blackLevelToPP3}
			inverseMap={blackLevelFromPP3}
			displayValue={(value) => Number(blackLevelFromPP3(value).toFixed(1))}
			resetValue={0}
			centered
			ignored={edits.pp3.Exposure.Auto as boolean}
			onchange={() => { edits.pp3.Exposure.Auto = false; edits.pushHistory(); }}
		/>
	
	</AdjustmentGroup>
	<AdjustmentGroup title="Dynamic Range" group="dynamicRange">
		{@const shadowsHighlights = edits.pp3['Shadows_&_Highlights']}
		<Slider
			label="Highlights"
			bind:value={shadowsHighlights.Highlights as number}
			min={0}
			max={100}
			step={1}
			ignored={!shadowsHighlights.Enabled as boolean}
			onchange={() => { shadowsHighlights.Enabled = true; edits.pushHistory(); }}
		/>
		<Slider
			label="Shadows"
			bind:value={shadowsHighlights.Shadows as number}
			min={0}
			max={100}
			step={1}
			ignored={!shadowsHighlights.Enabled as boolean}
			onchange={() => { shadowsHighlights.Enabled = true; edits.pushHistory(); }}
		/>
	
	</AdjustmentGroup>
	<AdjustmentGroup title="Color" group="globalColor">
		<AdjustmentSubsection title="Saturation" group="saturation">
		<Slider
			label="Saturation"
			bind:value={edits.pp3.Exposure.Saturation as number}
			centered
			onchange={() => edits.pushHistory()}
		/>
		</AdjustmentSubsection>
		<AdjustmentSubsection title="Muted Saturation" section="Vibrance">
		<Slider label="Muted Saturation" bind:value={edits.pp3.Vibrance.Pastels as number} min={-100} max={100} step={1} centered resetValue={0} ignored={!edits.pp3.Vibrance.Enabled as boolean} onchange={() => {
			edits.pp3.Vibrance.PastSatTog = false;
			edits.pp3.Vibrance.Saturated = 0;
			edits.pp3.Vibrance.Enabled = true; edits.pushHistory();
		}} />
		</AdjustmentSubsection>
	</AdjustmentGroup>
	<AdjustmentGroup title="Color Mixer" group="colorMixer">
		<ColorAdjustments mode="mixer" />
	</AdjustmentGroup>
	<AdjustmentGroup title="Clarity" group="clarity">
		<AdjustmentSubsection title="Local Contrast" section="Local_Contrast">
		<Slider label="Amount" bind:value={edits.pp3.Local_Contrast.Amount as number} min={0} max={1} step={0.01} resetValue={0.2} ignored={!edits.pp3.Local_Contrast.Enabled as boolean} onchange={() => { edits.pp3.Local_Contrast.Enabled = true; edits.pushHistory(); }} />
		<details><summary class="min-h-11 cursor-pointer py-3 text-xs font-semibold uppercase tracking-wider text-neutral-300">Advanced</summary><div class="space-y-3">
		<Slider label="Radius" bind:value={edits.pp3.Local_Contrast.Radius as number} min={20} max={200} step={1} resetValue={80} ignored={!edits.pp3.Local_Contrast.Enabled as boolean} onchange={() => { edits.pp3.Local_Contrast.Enabled = true; edits.pushHistory(); }} />
		<Slider label="Darkness" bind:value={edits.pp3.Local_Contrast.Darkness as number} min={0} max={3} step={0.01} resetValue={1} ignored={!edits.pp3.Local_Contrast.Enabled as boolean} onchange={() => { edits.pp3.Local_Contrast.Enabled = true; edits.pushHistory(); }} />
		<Slider label="Lightness" bind:value={edits.pp3.Local_Contrast.Lightness as number} min={0} max={3} step={0.01} resetValue={1} ignored={!edits.pp3.Local_Contrast.Enabled as boolean} onchange={() => { edits.pp3.Local_Contrast.Enabled = true; edits.pushHistory(); }} />
		</div></details>
		</AdjustmentSubsection>
		<AdjustmentSubsection title="Dehaze" section="Dehaze">
		<Slider
			label="Amount"
			bind:value={edits.pp3.Dehaze.Strength as number}
			min={0}
			max={100}
			step={1}
			resetValue={0}
			ignored={!edits.pp3.Dehaze.Enabled as boolean}
			onchange={() => { edits.pp3.Dehaze.Enabled = true; edits.pushHistory(); }}
		/>
	
		</AdjustmentSubsection>

	</AdjustmentGroup>
	<AdjustmentGroup title="Sharpening" group="detail">
		<Slider label="Amount" bind:value={edits.pp3.Sharpening.Amount as number} min={0} max={200} step={1} resetValue={50} onchange={() => { edits.pp3.Sharpening.Enabled = true; edits.pushHistory(); }} />
		<Slider label="Radius" bind:value={edits.pp3.Sharpening.Radius as number} min={0.1} max={5} step={0.1} resetValue={1} onchange={() => { edits.pp3.Sharpening.Enabled = true; edits.pushHistory(); }} />
	
	</AdjustmentGroup>
	<AdjustmentGroup title="Look" group="look">
		<AdjustmentSubsection title="LUT" section="Film_Simulation">
			<Button onclick={() => (showLutPicker = true)}>
				{#if edits.pp3.Film_Simulation.ClutFilename}
					{@const path = edits.pp3.Film_Simulation.ClutFilename as string}
					{@const onlyTransformsAndLut = setLut(filterPP3(edits.throttledPP3, ['Crop', 'Rotation']), path)}
					<img src="{apiPath}/edit?preview&config={toBase64(onlyTransformsAndLut)}" alt="" class="rounded-md" loading="lazy" />
					<b class="mt-2 block truncate">{lutPathToName(edits.pp3.Film_Simulation.ClutFilename as string)}</b>
				{:else}
					Select LUT
				{/if}
			</Button>
			<Slider label="Strength" bind:value={edits.pp3.Film_Simulation.Strength as number} min={0} max={100} step={1} ignored={!edits.pp3.Film_Simulation.Enabled as boolean} onchange={() => edits.pushHistory()} />
		</AdjustmentSubsection>
		<AdjustmentSubsection title="Calibration" section="Channel_Mixer">
		<ColorAdjustments mode="calibration" />
		</AdjustmentSubsection>
	</AdjustmentGroup>
</section>

<style>
	.control-section {
		margin-bottom: 1.5rem;
		padding-bottom: 0.25rem;
	}
</style>
