<script lang="ts">
	import BasePP3 from '$lib/assets/client.pp3?raw';
	import { edits } from '$lib/state/editing.svelte';
	import { filterPP3, toBase64 } from '$lib/pp3-utils';
	import BeforeAfter from '$lib/ui/BeforeAfter.svelte';
	import Checkbox from '$lib/ui/Checkbox.svelte';
	import Section from '$lib/ui/Section.svelte';
	import Slider from '$lib/ui/Slider.svelte';
	import LutPicker from '$lib/ui/LutPicker.svelte';

	let { data } = $props();
	let showLutPicker = $state(false);

	const sampleImage = $derived('/edit?config=' + toBase64(edits.throttledPP3));
	const beforeImage = $derived('/edit?preview&config=' + toBase64(filterPP3(edits.throttledPP3, ['Crop', 'Rotation'])));
</script>

<div class="image-editor">
	<div class="editor-layout">
		<!-- Image Preview -->
		<div class="image-preview">
			<!-- <div class="image-container"> -->
			<BeforeAfter {beforeImage} afterImage={sampleImage} filename="sample-image.jpg" dimensions="1920 × 1080" />
			<!-- </div> -->
		</div>

		<!-- Controls Panel -->
		<div class="controls-panel">
			<div class="panel-header">
				<h2 class="panel-title">Adjustments</h2>
				<button class="reset-btn" onclick={() => edits.initialize(BasePP3)}>Reset All</button>
			</div>

			<div class="controls-sections">
				<!-- Basic Adjustments -->
				<section class="control-section">
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
					<Section title="Film Simulation" section="Film_Simulation">
						<button class="select-lut-btn" onclick={() => (showLutPicker = true)}>Select Lut</button>
						<Slider
							label="Strength"
							bind:value={edits.pp3.Film_Simulation.Strength as number}
							min={0}
							max={100}
							step={1}
							ignored={!edits.pp3.Film_Simulation.Enabled as boolean}
						/>
						<!-- TODO: show current lut -->
					</Section>

					<!-- <Section title="Color" section="Color">
						<Checkbox label="Auto White Balance" bind:checked={edits.pp3.Color.AutoWhiteBalance as boolean} />
						<Slider
							label="Temperature"
							bind:value={edits.pp3.Color.Temperature as number}
							min={-100}
							max={100}
							step={1}
							centered
							onchange={() => (edits.pp3.Color.AutoWhiteBalance = false)}
						/>
						<Slider label="Tint" bind:value={edits.pp3.Color.Tint as number} min={-100} max={100} step={1} centered onchange={() => (edits.pp3.Color.AutoWhiteBalance = false)} />
					</Section> -->
				</section>
			</div>
		</div>
	</div>
</div>

{#if showLutPicker}
	<LutPicker luts={data.luts} onClose={() => (showLutPicker = false)} />
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
		height: 100vh;
		background: var(--bg-0);
		color: var(--text-1);
		overflow: hidden;
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
