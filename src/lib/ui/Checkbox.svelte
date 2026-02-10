<script lang="ts">
	interface Props {
		checked?: boolean;
		disabled?: boolean;
		label?: string;
		id?: string;
		name?: string;
		small?: boolean;
		onchange?: (value: boolean) => void;
	}

	let { checked = $bindable(false), disabled = false, label = 'Toggle', id = `toggle-${Math.random().toString(36).slice(2, 9)}`, name, small, onchange }: Props = $props();

	function handleChange(e: Event) {
		const next = (e.target as HTMLInputElement).checked;
		checked = next;
		onchange?.(next);
	}
</script>

<div class="focus flex items-center gap-3" class:flex-1={!!label} class:justify-between={!!label} class:py-2={!small}>
	{#if label}
		<label for={id} class="flex-1 font-medium text-zinc-300 select-none">
			{label}
		</label>
	{/if}

	<!-- Switch wrapper -->
	<label
		role="switch"
		aria-checked={checked}
		aria-disabled={disabled}
		class="relative z-10 h-5 w-12 cursor-pointer rounded-full pointer-events-auto
		transition-colors outline-none select-none focus-visible:ring-2
		focus-visible:ring-sky-500/60
		{checked ? 'bg-neutral-200 ring-neutral-300' : 'bg-neutral-950 ring-neutral-500'}"
		class:opacity-60={disabled}
	>
		<!-- Track background (dark) -->
		<div
			class="
        background absolute inset-0 overflow-hidden rounded-full
        ring-1
      "
		>
			<div class={`absolute inset-0 ${checked ? 'bg-neutral-200' : 'bg-neutral-950'}`}></div>
		</div>

		<!-- Knob -->
		<div
			class={`
        transition-left absolute top-1/2 h-4 w-4 -translate-y-1/2
        rounded-full shadow-sm ring-1
        duration-150 ease-out
        ${checked ? 'bg-neutral-500 ring-neutral-600' : 'bg-white ring-neutral-300'}
      `}
			style={`left:${checked ? `calc(100% - 1.15rem)` : '0.25rem'}`}
			aria-hidden="true"
		></div>

		<!-- Native checkbox for keyboard + screen readers -->
		<input
			{id}
			{name}
			type="checkbox"
			class="absolute inset-0 opacity-0 pointer-events-auto"
			{disabled}
			bind:checked
			onchange={handleChange}
			onpointerdown={(e) => e.stopPropagation()}
			onclick={(e) => e.stopPropagation()}
		/>
	</label>
</div>

<style>
	label[role='switch'] {
		box-shadow: inset 4px 4px black;
	}

	.focus:focus-within {
		.background {
			outline: 2px solid white;
		}
	}
</style>
