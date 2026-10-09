<script lang="ts">
	import { edits } from '$lib/state/editing.svelte';
	let { mode }: { mode: 'mixer' | 'calibration' } = $props();
	import Slider from './Slider.svelte';
	import { primaryDefaults, gradeToRgb, rgbToGrade } from '$lib/color-controls';
	const colors = ['Red', 'Orange', 'Yellow', 'Green', 'Cyan', 'Blue', 'Purple', 'Magenta'];
	const hues = [0, 1 / 12, 1 / 6, 1 / 3, 1 / 2, 2 / 3, 3 / 4, 5 / 6];
	let color = $state(0);
	let primaryIndex = $state(0);
	const primaryValues = $derived.by(() => {
		const channels = ['Red', 'Green', 'Blue'].map((key) => Number(String(edits.pp3.Channel_Mixer[key]).split(';')[primaryIndex]));
		const result = rgbToGrade(channels, primaryIndex * 120);
		const delta = ((result.hue - primaryIndex * 120 + 540) % 360) - 180;
		return { hue: Math.round(delta / 0.3), saturation: Math.round((result.amount / 1000 - 1) * 200) };
	});
	function setPrimary(hue: number, saturation: number) {
		const channels = gradeToRgb(primaryIndex * 120 + hue * 0.3, 1000 * (1 + saturation / 200));
		for (const [index, key] of ['Red', 'Green', 'Blue'].entries()) {
			const row = String(edits.pp3.Channel_Mixer[key]).split(';').filter(Boolean).map(Number);
			row[primaryIndex] = Math.round(channels[index] + 1000 / 3);
			edits.pp3.Channel_Mixer[key] = `${row.join(';')};`;
		}
		edits.pp3.Channel_Mixer.Enabled = true;
		edits.pushHistory();
	}
	function curveValue(key: string, index: number) {
		const values = String(edits.pp3.HSV_Equalizer[key] ?? '0;').split(';').map(Number);
		for (let i = 1; i + 3 < values.length; i += 4) {
			if (Math.abs(values[i] - hues[index]) < 0.002) return Math.round((values[i + 1] - 0.5) * 200);
		}
		return 0;
	}
	function setCurve(key: string, value: number) {
		const existing = String(edits.pp3.HSV_Equalizer[key] ?? '0;').split(';').filter(Boolean).map(Number);
		const points: number[][] = [];
		if (existing[0] === 1) {
			for (let i = 1; i + 3 < existing.length; i += 4) points.push(existing.slice(i, i + 4));
		}
		if (!points.length) for (const hue of hues) points.push([hue, 0.5, 0.35, 0.35]);
		const point = points.find((point) => Math.abs(point[0] - hues[color]) < 0.002);
		if (point) point[1] = 0.5 + value / 200;
		else points.push([hues[color], 0.5 + value / 200, 0.35, 0.35]);
		points.sort((a, b) => a[0] - b[0]);
		edits.pp3.HSV_Equalizer[key] = `1;${points.flat().join(';')};`;
		edits.pp3.HSV_Equalizer.Enabled = true;
		edits.pushHistory();
	}
</script>

{#if mode === 'mixer'}
<div class="space-y-3">
	<label class="text-xs text-neutral-300" for="mixer-color">Color range</label>
	<select id="mixer-color" bind:value={color} class="rounded-lg border border-neutral-600 bg-neutral-900 p-3 text-neutral-100">
		{#each colors as name, index}<option value={index}>{name}</option>{/each}
	</select>
	<Slider label="Hue" value={curveValue('HCurve', color)} min={-100} max={100} centered resetValue={0} onchange={(value) => setCurve('HCurve', value)} />
	<Slider label="Saturation" value={curveValue('SCurve', color)} min={-100} max={100} centered resetValue={0} onchange={(value) => setCurve('SCurve', value)} />
	<Slider label="Brightness" value={curveValue('VCurve', color)} min={-100} max={100} centered resetValue={0} onchange={(value) => setCurve('VCurve', value)} />
</div>

{:else}
<div class="space-y-3">
	<h3 class="text-xs font-semibold uppercase tracking-wider text-neutral-300">Calibration</h3>
	<div class="grid grid-cols-3 gap-2" role="group" aria-label="Primary color">
		{#each primaryDefaults as primary, index}
			<button type="button" class="min-h-12 rounded-xl border px-2 text-sm font-semibold" class:bg-neutral-100={primaryIndex === index} class:text-neutral-950={primaryIndex === index} class:border-neutral-100={primaryIndex === index} class:border-neutral-600={primaryIndex !== index} aria-pressed={primaryIndex === index} onclick={() => (primaryIndex = index)}>{primary.name}</button>
		{/each}
	</div>
	<Slider label="Hue" value={primaryValues.hue} min={-100} max={100} centered resetValue={0} onchange={(value) => setPrimary(value, primaryValues.saturation)} />
	<Slider label="Saturation" value={primaryValues.saturation} min={-100} max={100} centered resetValue={0} onchange={(value) => setPrimary(primaryValues.hue, value)} />
	<button type="button" class="min-h-12 rounded-xl border border-neutral-600 text-sm font-semibold hover:bg-neutral-800" onclick={() => setPrimary(0, 0)}>Reset {primaryDefaults[primaryIndex].name}</button>
</div>

{/if}
