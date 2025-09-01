<script lang="ts">
	import BasePP3 from '$lib/assets/client.pp3?raw';
	import { edits } from '$lib/state/editing.svelte';
	import { filterPP3, setLut, toBase64 } from '$lib/pp3-utils';
	import BeforeAfter from '$lib/ui/BeforeAfter.svelte';
	import Checkbox from '$lib/ui/Checkbox.svelte';
	import Section from '$lib/ui/Section.svelte';
	import Slider from '$lib/ui/Slider.svelte';
	import LutPicker from '$lib/ui/LutPicker.svelte';
	import { getWorkerInstance } from '$lib';
	import { page } from '$app/state';
	import { IconFidgetSpinner } from '@tabler/icons-svelte';
	import { fade } from 'svelte/transition';
	import Select from '$lib/ui/Select.svelte';
	import Button from '$lib/ui/Button.svelte';

	let { data } = $props();
	let showLutPicker = $state(false);

	let sampleImage = $state('');
	let apiPath = $derived(`/api/images/${data.image.id}`);
	let beforeImage = $derived(apiPath + `/edit?preview&config=${toBase64(filterPP3(edits.throttledPP3, ['Crop', 'Rotation']))}`);

	$effect(() => {
		const worker = getWorkerInstance();
		edits.isLoading = true;
		worker
			.refreshImage(page.params.img!, toBase64(edits.throttledPP3))
			.then((result) => {
				sampleImage = result.url;
				edits.isFaulty = result.error;
				edits.isLoading = false;
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

<div class="image-editor">
	<div class="editor-layout">
		<!-- Image Preview -->
		<div class="image-preview">
			<BeforeAfter {beforeImage} afterImage={sampleImage} />
		</div>

		<!-- Controls Panel -->
		<div class="controls-panel">
			<div class="panel-header">
				<h2 class="panel-title">Adjustments</h2>
				{#if edits.isLoading}
					<div in:fade={{ duration: 200, delay: 200 }}>
						<IconFidgetSpinner class="animate-spin" size={24} />
					</div>
				{/if}
				<!-- <button disabled={!edits.canUndo} onclick={() => edits.undo()}>Undo</button>
				<button disabled={!edits.canRedo} onclick={() => edits.redo()}>Redo</button> -->
				<button class="reset-btn" onclick={() => edits.initialize(BasePP3)}>Reset All</button>
			</div>

			<div class="controls-sections">
				<!-- Basic Adjustments -->
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
								if (isCamera) {
									// TODO: Fetch camera white balance settings
									edits.pp3.White_Balance.Temperature = 4708;
									edits.pp3.White_Balance.Green = 0.667;
								}
							}}
							bind:value={edits.pp3.White_Balance.Setting as string}
						/>
						<Slider
							label="Temperature"
							bind:value={edits.pp3.White_Balance.Temperature as number}
							min={-3000}
							max={3000}
							step={1}
							centered
							map={(n) => n + 4708}
							inverseMap={(n) => n - 4708}
							ignored={edits.pp3.White_Balance.Setting !== 'Custom'}
							onchange={() => (edits.pp3.White_Balance.Setting = 'Custom')}
							overlay="bg-gradient-to-r from-[#0000FF] to-[#FFFF00]"
						/>
						<Slider
							label="Tint"
							overlay="bg-gradient-to-r from-[#FF00FF] to-[#00FF00]"
							bind:value={edits.pp3.White_Balance.Green as number}
							min={Math.log10(0.001)}
							max={Math.log10(100)}
							resetValue={0.667}
							ignored={edits.pp3.White_Balance.Setting !== 'Custom'}
							onchange={() => (edits.pp3.White_Balance.Setting = 'Custom')}
							step={0.001}
							precision={3}
							map={(x) => Math.pow(10, x)}
							inverseMap={(y) => Math.log10(y)}
						/>
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
					</Section>
					<!-- <Section section="Color" title="Color">
						<Slider label="Saturation" bind:value={edits.pp3.Color.Saturation as number} min={0} max={200} step={1} resetValue={100} />
						<Slider label="Vibrance" bind:value={edits.pp3.Color.Vibrance as number} min={-100} max={100} step={1} centered resetValue={0} />
					</Section>
					<Section title="Tone" section="Tone">
						<Slider label="Highlights" bind:value={edits.pp3.Tone.Highlights as number} min={-100} max={100} step={1} centered resetValue={0} />
						<Slider label="Shadows" bind:value={edits.pp3.Tone.Shadows as number} min={-100} max={100} step={1} centered resetValue={0} />
						<Slider label="Whites" bind:value={edits.pp3.Tone.Whites as number} min={-100} max={100} step={1} centered resetValue={0} />
						<Slider label="Blacks" bind:value={edits.pp3.Tone.Blacks as number} min={-100} max={100} step={1} centered resetValue={0} />
					</Section>
					<Section title="Detail" section="Detail" enabledKey="Sharpen_Enabled">
						<Slider label="Sharpen Amount" bind:value={edits.pp3.Detail.Sharpen_Amount as number} min={0} max={200} step={1} resetValue={50} />
						<Slider label="Sharpen Radius" bind:value={edits.pp3.Detail.Sharpen_Radius as number} min={0.1} max={5} step={0.1} resetValue={1} />
						<Slider label="Noise - Luma" bind:value={edits.pp3.Detail.Noise_Luma as number} min={0} max={100} step={1} resetValue={0} />
						<Slider label="Noise - Chroma" bind:value={edits.pp3.Detail.Noise_Chroma as number} min={0} max={100} step={1} resetValue={0} />
					</Section> -->
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
				</section>
			</div>
		</div>
	</div>
</div>

{#if showLutPicker}
	<LutPicker luts={data.luts} onClose={() => (showLutPicker = false)} imageId={page.params.img!} />
{/if}

<style>
	/* Minimalist grayscale palette */
	:root {
		--bg-0: #0e0e0e;
		--bg-1: #111111;
		--bg-2: #151515;
		--bg-3: #1e1e1e;
		--bg-4: #262626;

		--border-1: #2a2a2a;
		--border-2: #343434;

		--text-0: #fafafa;
		--text-1: #e7e7e7;
		--text-2: #cfcfcf;
		--text-3: #b5b5b5;

		--muted: #9a9a9a;
	}

	.image-editor {
		background: var(--bg-0);
		color: var(--text-1);
		overflow: hidden;
		height: 100%;
	}

	.editor-layout {
		display: grid;
		grid-template-columns: 1fr 350px;
		height: 100%;
	}

	/* Image Preview */
	.image-preview {
		background: var(--bg-1);
		display: flex;
		align-items: center;
		justify-content: center;
		position: relative;
		overflow: hidden;
	}

	/* Controls Panel */
	.controls-panel {
		background: var(--bg-2);
		border-left: 1px solid var(--border-1);
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.panel-header {
		padding: 1.25rem 1.5rem;
		border-bottom: 1px solid var(--border-1);
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.panel-title {
		margin: 0;
		font-size: 1.125rem;
		font-weight: 600;
		color: var(--text-0);
	}

	.reset-btn {
		padding: 0.5rem 1rem;
		background: transparent;
		border: 1px solid var(--border-2);
		border-radius: 6px;
		color: var(--text-2);
		font-size: 0.875rem;
		cursor: pointer;
		transition:
			background 0.2s ease,
			border-color 0.2s ease,
			color 0.2s ease;
	}

	.reset-btn:hover {
		background: var(--bg-3);
		border-color: var(--border-2);
		color: var(--text-1);
	}

	.controls-sections {
		flex: 1;
		overflow-y: auto;
		padding: 1rem 1.25rem 1.25rem;
	}

	.control-section {
		margin-bottom: 1.5rem;
		padding-bottom: 0.25rem;
	}

	/* Scrollbar styling */
	.controls-sections::-webkit-scrollbar {
		width: 6px;
	}

	.controls-sections::-webkit-scrollbar-track {
		background: var(--bg-2);
	}

	.controls-sections::-webkit-scrollbar-thumb {
		background: #3a3a3a;
		border-radius: 3px;
	}

	.controls-sections::-webkit-scrollbar-thumb:hover {
		background: #4a4a4a;
	}

	/* Responsive */
	@media (max-width: 1024px) {
		.editor-layout {
			grid-template-columns: 1fr;
			grid-template-rows: 1fr auto;
		}

		.controls-panel {
			max-height: 50vh;
			border-left: none;
			border-top: 1px solid var(--border-1);
		}
	}
</style>
