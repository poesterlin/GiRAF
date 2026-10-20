<script lang="ts">
	import { edits } from '$lib/state/editing.svelte';
	import { maskKind, maskSize } from '$lib/local-masks';
	let { index, aspect = 1.5 }: { index: number; aspect?: number } = $props();
	const locallab = $derived(edits.pp3.Locallab);
	const kind = $derived(maskKind(edits.pp3, index));
	// Placed as the photo overlay places it: the centre runs -1000..1000 across the photo
	const left = $derived(50 + Number(locallab[`CenterX_${index}`] ?? 0) / 20);
	const top = $derived(50 + Number(locallab[`CenterY_${index}`] ?? 0) / 20);
</script>

<span
	class="relative block h-6 shrink-0 overflow-hidden rounded-sm bg-neutral-700 ring-1 ring-neutral-600"
	style:aspect-ratio={aspect}
	class:opacity-40={!locallab[`Activ_${index}`]}
	aria-hidden="true"
>
	{#if kind === 'GRADIENT'}
		<!-- The shaded half is the side the gradient's angle points to, where it acts -->
		<span
			class="absolute h-[400%] w-[400%]"
			style:left={`${left}%`}
			style:top={`${top}%`}
			style:transform={`translate(-50%, -50%) rotate(${-Number(locallab[`Angcol_${index}`] ?? 0)}deg)`}
		>
			<span class="gradient-side absolute inset-x-0 top-0 h-1/2"></span>
			<span class="absolute inset-x-0 top-1/2 border-t border-white"></span>
		</span>
	{:else}
		<span
			class="absolute border border-white bg-white/30"
			style:left={`${left}%`}
			style:top={`${top}%`}
			style:width={`${maskSize(edits.pp3, index, 'width')}%`}
			style:height={`${maskSize(edits.pp3, index, 'height')}%`}
			style:border-radius={kind === 'ELI' ? '50%' : '1px'}
			style:transform="translate(-50%, -50%)"
		></span>
	{/if}
</span>

<style>
	.gradient-side {
		background: linear-gradient(to top, rgb(255 255 255 / 0.55), transparent 12%);
	}
</style>
