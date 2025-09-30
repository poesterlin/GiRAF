<script lang="ts">
	import { page } from '$app/state';
	import { getWorkerInstance, map } from '$lib';
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

	let sampleImage = $state('');
	let apiPath = $derived(`/api/images/${data.image.id}`);

	$effect(() => {
		const worker = getWorkerInstance();
		edits.isLoading = true;
		worker
			.refreshImage(page.params.img!, toBase64(edits.throttledPP3))
			.then((result) => {
				if (result) {
					sampleImage = result.url;
					edits.isFaulty = result.error;
					edits.isLoading = false;
				}
			})
			.catch((error) => {
				console.error('Error refreshing image:', error);
				edits.isFaulty = true;
				edits.isLoading = false;
			});
	});

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
			}}
			bind:value={edits.pp3.White_Balance.Setting as string}
		/>
		{#if edits.pp3.White_Balance.Temperature && edits.pp3.White_Balance.Green}
			<Slider
				label="Temperature"
				bind:value={edits.pp3.White_Balance.Temperature as number}
				min={data.image.whiteBalance! - 3000}
				max={data.image.whiteBalance! + 3000}
				step={1}
				centered
				resetValue={data.image.whiteBalance!}
				ignored={edits.pp3.White_Balance.Setting !== 'Custom'}
				onchange={() => (edits.pp3.White_Balance.Setting = 'Custom')}
				overlay="bg-gradient-to-r from-[#0000FF] to-[#FFFF00]"
			/>
			<Slider
				label="Tint"
				overlay="bg-gradient-to-r from-[#FF00FF] to-[#00FF00]"
				bind:value={edits.pp3.White_Balance.Green as number}
				min={-100}
				max={100}
				resetValue={data.image.tint ?? 1}
				ignored={edits.pp3.White_Balance.Setting !== 'Custom'}
				onchange={() => (edits.pp3.White_Balance.Setting = 'Custom')}
				step={0.001}
				centered
				precision={3}
				map={(x) => map(x, -100, 100, 0.5, 1.5)}
				inverseMap={(y) => map(y, 0.5, 1.5, -100, 100)}
			/>
		{/if}
	</Section>
	<Section title="Exposure" section="Exposure">
		<Checkbox label="Auto Exposure" bind:checked={edits.pp3.Exposure.Auto as boolean} />
		<Slider
			label="Exposure"
			bind:value={edits.pp3.Exposure.Compensation as number}
			min={-5}
			max={5}
			step={0.1}
			centered
			ignored={edits.pp3.Exposure.Auto as boolean}
			onchange={() => (edits.pp3.Exposure.Auto = false)}
		/>
		<Slider
			label="Brightness"
			bind:value={edits.pp3.Exposure.Brightness as number}
			centered
			ignored={edits.pp3.Exposure.Auto as boolean}
			onchange={() => (edits.pp3.Exposure.Auto = false)}
		/>
		<Slider label="Contrast" bind:value={edits.pp3.Exposure.Contrast as number} centered />
		<Slider label="Saturation" bind:value={edits.pp3.Exposure.Saturation as number} centered />
		<Slider label="Highlights" bind:value={edits.pp3.Exposure.HighlightCompr as number} centered map={(x) => -x} inverseMap={(y) => -y} />
		<Slider label="Shadows" bind:value={edits.pp3.Exposure.ShadowCompr as number} centered />
		<Slider label="Black" bind:value={edits.pp3.Exposure.Black as number} centered />
	</Section>
	<Section title="Sharpening" section="Sharpening" enabledKey="Sharpen_Enabled">
		<Slider label="Sharpen Amount" bind:value={edits.pp3.Sharpening.Amount as number} min={0} max={200} step={1} resetValue={50} />
		<Slider label="Sharpen Radius" bind:value={edits.pp3.Sharpening.Radius as number} min={0.1} max={5} step={0.1} resetValue={1} />
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
			<Slider label="Strength" bind:value={edits.pp3.Film_Simulation.Strength as number} min={0} max={100} step={1} ignored={!edits.pp3.Film_Simulation.Enabled as boolean} />
		</Section>
	{/if}
</section>

<style>
	.control-section {
		margin-bottom: 1.5rem;
		padding-bottom: 0.25rem;
	}
</style>
