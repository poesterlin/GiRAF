<script lang="ts">
	import { map } from '$lib';
	import { filterPP3, setLut, toBase64 } from '$lib/pp3-utils';
	import type { Image, Snapshot } from '$lib/server/db/schema';
	import { edits } from '$lib/state/editing.svelte';
	import Button from '$lib/ui/Button.svelte';
	import Checkbox from '$lib/ui/Checkbox.svelte';
	import Section from '$lib/ui/Section.svelte';
	import Select from '$lib/ui/Select.svelte';
	import Slider from '$lib/ui/Slider.svelte';

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

<section class="control-section">
	<Section title="White Balance" section="White_Balance">
		<!-- Select options for: edits.pp3.White_Balance.Setting -->
		<Select
			ariaLabel="White Balance"
			options={{
				Camera: 'Camera',
				Daylight: 'Daylight',
				Shade: 'Shade',
				Cloudy: 'Cloudy',
				Custom: 'Custom'
			}}
			onchange={(value) => {
				const isCamera = value === 'Camera';
				const img = data.image;
				if (isCamera && img.whiteBalance && img.tint) {
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
				min={-3000}
				max={3000}
				step={1}
				centered
				resetValue={data.image.whiteBalance!}
				ignored={edits.pp3.White_Balance.Setting !== 'Custom'}
				onchange={() => { edits.pp3.White_Balance.Setting = 'Custom'; edits.pushHistory(); }}
				overlay="bg-gradient-to-r from-neutral-700 to-neutral-100"
				map={(x) => map(x, -3000, 3000, data.image.whiteBalance! - 3000, data.image.whiteBalance! + 3000)}
				inverseMap={(y) => map(y, data.image.whiteBalance! - 3000, data.image.whiteBalance! + 3000, -3000, 3000)}
			/>
			<Slider
				label="Tint"
				overlay="bg-gradient-to-r from-neutral-700 to-neutral-100"
				bind:value={edits.pp3.White_Balance.Green as number}
				min={-100}
				max={100}
				resetValue={data.image.tint ?? 1}
				ignored={edits.pp3.White_Balance.Setting !== 'Custom'}
				onchange={() => { edits.pp3.White_Balance.Setting = 'Custom'; edits.pushHistory(); }}
				step={0.001}
				centered
				precision={3}
				map={(x) => map(x, -100, 100, 0.5, 1.5)}
				inverseMap={(y) => map(y, 0.5, 1.5, -100, 100)}
			/>
		{/if}
	</Section>
	<Section title="Exposure" section="Exposure">
		<Checkbox label="Auto Exposure" bind:checked={edits.pp3.Exposure.Auto as boolean} onchange={() => edits.pushHistory()} />
		<Slider
			label="Exposure"
			bind:value={edits.pp3.Exposure.Compensation as number}
			min={-5}
			max={5}
			step={0.1}
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
			label="Saturation"
			bind:value={edits.pp3.Exposure.Saturation as number}
			centered
			onchange={() => edits.pushHistory()}
		/>
		<Slider
			label="Black Level"
			bind:value={edits.pp3.Exposure.Black as number}
			min={-16384}
			max={32768}
			step={1}
			resetValue={0}
			centered
			ignored={edits.pp3.Exposure.Auto as boolean}
			onchange={() => { edits.pp3.Exposure.Auto = false; edits.pushHistory(); }}
		/>
		<Slider
			label="Highlight Compression"
			bind:value={edits.pp3.Exposure.HighlightCompr as number}
			min={0}
			max={500}
			step={1}
			resetValue={0}
			ignored={edits.pp3.Exposure.Auto as boolean}
			onchange={() => { edits.pp3.Exposure.Auto = false; edits.pushHistory(); }}
		/>
		<Slider
			label="Highlight Threshold"
			bind:value={edits.pp3.Exposure.HighlightComprThreshold as number}
			min={0}
			max={100}
			step={1}
			resetValue={0}
			ignored={edits.pp3.Exposure.Auto as boolean}
			onchange={() => { edits.pp3.Exposure.Auto = false; edits.pushHistory(); }}
		/>
	</Section>
	<Section title="Vibrance" section="Vibrance">
		<Slider label="Vibrance (Muted Colors)" bind:value={edits.pp3.Vibrance.Pastels as number} min={-100} max={100} step={1} centered resetValue={0} ignored={!edits.pp3.Vibrance.Enabled as boolean} onchange={() => {
			if (edits.pp3.Vibrance.PastSatTog) edits.pp3.Vibrance.Saturated = edits.pp3.Vibrance.Pastels;
			edits.pp3.Vibrance.Enabled = true; edits.pushHistory();
		}} />
		{#if !edits.pp3.Vibrance.PastSatTog}
			<Slider label="Saturated Colors" bind:value={edits.pp3.Vibrance.Saturated as number} min={-100} max={100} step={1} centered resetValue={0} ignored={!edits.pp3.Vibrance.Enabled as boolean} onchange={() => { edits.pp3.Vibrance.Enabled = true; edits.pushHistory(); }} />
		{/if}
		<Checkbox label="Link Muted and Saturated Colors" bind:checked={edits.pp3.Vibrance.PastSatTog as boolean} onchange={() => {
			if (edits.pp3.Vibrance.PastSatTog) edits.pp3.Vibrance.Saturated = edits.pp3.Vibrance.Pastels;
			edits.pushHistory();
		}} />
		<Checkbox label="Protect Skin Tones" bind:checked={edits.pp3.Vibrance.ProtectSkins as boolean} onchange={() => edits.pushHistory()} />
		<Checkbox label="Avoid Color Shift" bind:checked={edits.pp3.Vibrance.AvoidColorShift as boolean} onchange={() => edits.pushHistory()} />
	</Section>
	<Section title="Local Contrast" section="Local_Contrast">
		<Slider label="Amount" bind:value={edits.pp3.Local_Contrast.Amount as number} min={0} max={1} step={0.01} resetValue={0.2} ignored={!edits.pp3.Local_Contrast.Enabled as boolean} onchange={() => { edits.pp3.Local_Contrast.Enabled = true; edits.pushHistory(); }} />
		<Slider label="Radius" bind:value={edits.pp3.Local_Contrast.Radius as number} min={20} max={200} step={1} resetValue={80} ignored={!edits.pp3.Local_Contrast.Enabled as boolean} onchange={() => { edits.pp3.Local_Contrast.Enabled = true; edits.pushHistory(); }} />
		<Slider label="Darkness" bind:value={edits.pp3.Local_Contrast.Darkness as number} min={0} max={3} step={0.01} resetValue={1} ignored={!edits.pp3.Local_Contrast.Enabled as boolean} onchange={() => { edits.pp3.Local_Contrast.Enabled = true; edits.pushHistory(); }} />
		<Slider label="Lightness" bind:value={edits.pp3.Local_Contrast.Lightness as number} min={0} max={3} step={0.01} resetValue={1} ignored={!edits.pp3.Local_Contrast.Enabled as boolean} onchange={() => { edits.pp3.Local_Contrast.Enabled = true; edits.pushHistory(); }} />
	</Section>
	<Section title="Shadows & Highlights" section="Shadows_&_Highlights">
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
	</Section>
	<Section title="Sharpening" section="Sharpening" enabledKey="Sharpen_Enabled">
		<Slider label="Sharpen Amount" bind:value={edits.pp3.Sharpening.Amount as number} min={0} max={200} step={1} resetValue={50} onchange={() => edits.pushHistory()} />
		<Slider label="Sharpen Radius" bind:value={edits.pp3.Sharpening.Radius as number} min={0.1} max={5} step={0.1} resetValue={1} onchange={() => edits.pushHistory()} />
	</Section>
	{#if edits.pp3?.Film_Simulation}
		<Section title="Film Simulation" section="Film_Simulation">
			<Button onclick={() => (showLutPicker = true)}>
				{#if edits.pp3.Film_Simulation.ClutFilename}
					{@const path = edits.pp3.Film_Simulation.ClutFilename as string}
					{@const onlyTransformsAndLut = setLut(filterPP3(edits.throttledPP3, ['Crop', 'Rotation']), path)}
					<img src="{apiPath}/edit?preview&config={toBase64(onlyTransformsAndLut)}" alt="" class="rounded-md" loading="lazy" />
					<b class="mt-2 block truncate">{lutPathToName(edits.pp3.Film_Simulation.ClutFilename as string)}</b>
				{:else}
					Select Lut
				{/if}
			</Button>
			<Slider label="Strength" bind:value={edits.pp3.Film_Simulation.Strength as number} min={0} max={100} step={1} ignored={!edits.pp3.Film_Simulation.Enabled as boolean} onchange={() => edits.pushHistory()} />
		</Section>
	{/if}
</section>

<style>
	.control-section {
		margin-bottom: 1.5rem;
		padding-bottom: 0.25rem;
	}
</style>
