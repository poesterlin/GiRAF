<script lang="ts">
	interface Props {
		checked?: boolean;
		disabled?: boolean;
		label?: string;
		id?: string;
		small?: boolean;
	}

	let { checked = $bindable(false), disabled = false, label = 'Toggle', id = `toggle-${Math.random().toString(36).slice(2, 9)}`, small }: Props = $props();

	function toggle(e: Event) {
		if (disabled) return;
		e.stopPropagation();
		checked = !checked;
	}

	function handleKeyDown(e: KeyboardEvent) {
		if (disabled) return;
		if (e.key === ' ' || e.key === 'Enter') {
			e.preventDefault();
			toggle(e);
		}
	}
</script>

<div class="flex flex-1 items-center justify-between gap-3 focus">
	<label for={id} class="flex-1 font-medium text-zinc-300 select-none">
		{label}
	</label>

	<!-- Switch wrapper -->
	<div
		role="switch"
		aria-checked={checked}
		aria-disabled={disabled}
		tabindex={disabled ? -1 : 0}
		onclick={toggle}
		onkeydown={handleKeyDown}
		class="
      relative cursor-pointer rounded-full transition-colors
      outline-none select-none focus-visible:ring-2
      focus-visible:ring-sky-500/60
      {checked ? 'bg-neutral-800/80' : 'bg-neutral-900/90'}
    "
		class:h-5={small}
		class:w-12={small}
		class:h-8={!small}
		class:w-16={!small}
		class:opacity-60={disabled}
	>
		<!-- Track background (dark) -->
		<div
			class="
        absolute inset-0 overflow-hidden rounded-full ring-1
        ring-neutral-700 background
      "
		>
			<div class="absolute inset-0 bg-neutral-900/90"></div>
		</div>

		<!-- Knob -->
		<div
			class="
        transition-left absolute top-1/2 -translate-y-1/2
        rounded-full bg-zinc-50 shadow-sm ring-1 ring-neutral-700
        duration-100 ease-linear
      "
			style={`left:${checked ? `calc(100% - ${small ? 1.15 : 1.75}rem)` : '0.25rem'}`}
			class:h-6={!small}
			class:w-6={!small}
			class:h-4={small}
			class:w-4={small}
			aria-hidden="true"
		></div>

		<!-- Native checkbox for keyboard + screen readers -->
		<input {id} type="checkbox" class="pointer-events-none absolute inset-0 opacity-0 hidden" {disabled} bind:checked />
	</div>
</div>

<style>
	div[role='switch'] {
		box-shadow: inset 4px 4px black;
	}

	.focus:focus-within {
		label {
		}

		.background{
			outline: 2px solid white;
		}
	}
</style>
