<script lang="ts" generics="T extends string">
	type Option = { label: string; value: T };
	let { options, value = $bindable() }: { options: Option[]; value: T } = $props();
</script>

<div class="flex w-full rounded-lg bg-neutral-800 p-1">
	{#each options as option}
		<button
			type="button"
			class="relative w-full rounded-md py-1.5 text-sm font-medium text-neutral-500 transition-colors focus:outline-none"
			class:!text-neutral-300={value === option.value}
			onclick={() => (value = option.value)}
		>
			{#if value === option.value}
				<div
					class="absolute inset-0 rounded-md bg-neutral-200"
					style="z-index: -1"
				></div>
			{/if}
			{option.label}
		</button>
	{/each}
</div>

<style>
	@keyframes fill-in {
		from {
			transform: scale(0.95);
			opacity: 0;
		}
		to {
			transform: scale(1);
			opacity: 1;
		}
	}

	@keyframes fill-out {
		from {
			transform: scale(1);
			opacity: 1;
		}
		to {
			transform: scale(0.95);
			opacity: 0;
		}
	}

	:global([transition-name='fill-in']) {
		animation: fill-in 0.2s ease-out;
	}
	:global([transition-name='fill-out']) {
		animation: fill-out 0.2s ease-in;
	}
</style>
