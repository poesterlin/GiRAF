<script lang="ts" generics="T extends string | number = string">
	import { onMount } from 'svelte';

	interface Props {
		options: Map<string | number, T> | Record<string, T>;
		value: T | undefined;
		placeholder?: string;
		disabled?: boolean;
		ariaLabel?: string;
		onchange?: (value: T | null) => void;
	}

	let { options = $bindable(new Map()), value = $bindable(), placeholder = 'Select', disabled = false, ariaLabel = 'Select', onchange }: Props = $props();

	let open = $state(false);
	let buttonEl = $state<HTMLButtonElement>();
	let listEl = $state<HTMLUListElement>();
	let activeIndex = $state(-1);
	const id = `s-${Math.random().toString(36).slice(2, 9)}`;

	// Normalize options to an array preserving original key types
	let entries = $derived.by(() => {
		const raw = options instanceof Map ? Array.from(options.entries()) : Object.entries(options);
		return raw.map(([k, v], i) => ({
			rawKey: k as string | number,
			label: v,
			id: `${id}-item-${i}`
		}));
	});

	// find selected index (try strict equality first, fallback to string)
	let selectedIndex = $derived(entries.findIndex((e) => e.rawKey === value || String(e.rawKey) === String(value)));
	let selectedLabel = $derived(selectedIndex >= 0 ? entries[selectedIndex].label : '');

	function toggle() {
		if (disabled) return;
		open = !open;
	}

	function close() {
		open = false;
		buttonEl?.focus();
	}

	function selectItem(i: number) {
		const item = entries[i];
		if (!item) return;
		// assign to exported prop so parent bound variable updates
		value = item.rawKey as any;
		onchange?.(value!);
		close();
	}

	function onKeydown(e: KeyboardEvent) {
		if (!open) {
			if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
				e.preventDefault();
				open = true;
				return;
			}
			return;
		}

		switch (e.key) {
			case 'ArrowDown': {
				e.preventDefault();
				activeIndex = (activeIndex + 1) % entries.length;
				scrollActiveIntoView();
				break;
			}
			case 'ArrowUp': {
				e.preventDefault();
				activeIndex = (activeIndex - 1 + entries.length) % entries.length;
				scrollActiveIntoView();
				break;
			}
			case 'Home': {
				e.preventDefault();
				activeIndex = 0;
				scrollActiveIntoView();
				break;
			}
			case 'End': {
				e.preventDefault();
				activeIndex = entries.length - 1;
				scrollActiveIntoView();
				break;
			}
			case 'Enter':
			case ' ': {
				e.preventDefault();
				selectItem(activeIndex);
				break;
			}
			case 'Escape': {
				e.preventDefault();
				close();
				break;
			}
		}
	}

	function onOptionMouseEnter(i: number) {
		activeIndex = i;
	}

	function scrollActiveIntoView() {
		const el = listEl?.querySelector(`#${id}-item-${activeIndex}`) as HTMLElement | null;
		el?.scrollIntoView({ block: 'nearest' });
	}

	function handleDocumentPointer(e: PointerEvent) {
		if (!open) return;
		if (buttonEl?.contains(e.target as Node) || listEl?.contains(e.target as Node)) return;
		close();
	}

	onMount(() => {
		document.addEventListener('pointerdown', handleDocumentPointer);
		return () => document.removeEventListener('pointerdown', handleDocumentPointer);
	});

	// when opened, set active to selected or first and focus list
	$effect(() => {
		if (open) {
			activeIndex = selectedIndex >= 0 ? selectedIndex : 0;
			setTimeout(() => listEl?.focus(), 0);
		}
	});
</script>

<div class="select">
	<button
		bind:this={buttonEl}
		type="button"
		class="trigger"
		aria-haspopup="listbox"
		aria-expanded={open}
		aria-labelledby={`${id}-label`}
		aria-disabled={disabled}
		onclick={toggle}
		onkeydown={onKeydown}
		{disabled}
	>
		<span id={`${id}-label`} class="label">
			{#if value !== null && value !== undefined}
				{selectedLabel}
			{:else}
				<span class="placeholder">{placeholder}</span>
			{/if}
		</span>
		<span class="caret" aria-hidden="true">▾</span>
	</button>

	{#if open}
		<ul bind:this={listEl} class="list z-20" role="listbox" tabindex="0" aria-activedescendant={activeIndex >= 0 ? `${id}-item-${activeIndex}` : undefined} onkeydown={onKeydown}>
			{#each entries as entry, i}
				<li
					id={entry.id}
					role="option"
					aria-selected={selectedIndex === i}
					class:selected={selectedIndex === i}
					class:active={activeIndex === i}
					onclick={() => selectItem(i)}
					onmouseenter={() => onOptionMouseEnter(i)}
				>
					{entry.label}
				</li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	.select {
		position: relative;
		width: 100%;
		font-size: 14px;
	}

	.trigger {
		width: 100%;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		padding: 0.75rem 1rem;
		border-radius: 6px;
		border: 1px solid #d0d0d0;
		background: #181818;
		color: #dddddd;
		cursor: pointer;
	}   

	.trigger:focus {
		outline: 2px solid #9ca3af;
	}

	.trigger[disabled],
	.trigger[aria-disabled='true'] {
		opacity: 0.8;
		cursor: default;
	}

	.label {
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.placeholder {
		color: #6b6b6b;
	}

	.caret {
		margin-left: 8px;
		color: #555;
		font-size: 0.85rem;
	}

	.list {
		position: absolute;
		left: 0;
		right: 0;
		margin-top: 6px;
		padding: 6px;
		max-height: 180px;
		overflow: auto;
		border-radius: 6px;
		border: 1px solid #d0d0d0;
		background: #fff;
		box-shadow: 0 6px 18px rgba(0, 0, 0, 0.08);
		list-style: none;
		outline: none;
		z-index: 20;
	}

	.list li {
		padding: 6px 8px;
		border-radius: 4px;
		cursor: pointer;
		color: #111;
	}

	.list li:hover,
	.list li.active {
		background: #efefef;
	}

	.list li.selected {
		font-weight: 600;
		background: #e6e6e6;
	}
</style>
