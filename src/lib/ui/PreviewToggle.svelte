<script lang="ts">
	import IconEye from '@tabler/icons-svelte/icons/eye';
	import IconEyeOff from '@tabler/icons-svelte/icons/eye-off';
	let { kind = 'compare', pressed, disabled = false, onclick }: {
		kind?: 'overlay' | 'compare'; pressed: boolean; disabled?: boolean; onclick: () => void;
	} = $props();
	const label = $derived(kind === 'overlay' ? 'Show mask outlines' : 'Show before adjustments');
	const tooltip = $derived(kind === 'overlay' ? (pressed ? 'Hide mask outlines' : 'Show mask outlines') : (pressed ? 'Show after adjustments' : 'Show before adjustments'));
</script>

<button type="button" aria-label={label} aria-pressed={pressed} {disabled} {onclick} data-tooltip={tooltip}>
	{#if kind === 'overlay'}
		<span class="mask-icon" aria-hidden="true">
			<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><ellipse cx="10" cy="10" rx="8" ry="6.5" stroke-dasharray="3 2" /></svg>
			<span class="visibility-badge">{#if pressed}<IconEye size={13} />{:else}<IconEyeOff size={13} />{/if}</span>
		</span>
	{:else}
		<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true">
			<path d="M12 3a9 9 0 0 1 0 18Z" fill="currentColor" stroke="none" />
			<circle cx="12" cy="12" r="9" />
			<path d="M12 2v20" />
		</svg>
	{/if}
</button>

<style>
	.mask-icon { position: relative; width: 24px; height: 24px; }
	.visibility-badge { position: absolute; right: -2px; bottom: -1px; display: flex; padding: 1px; border-radius: 3px; background: #171717; }
	button { position: relative; display: flex; width: 44px; height: 44px; align-items: center; justify-content: center; border-radius: 6px; color: #fff; }
	button[aria-pressed='true'] { background: #404040; }
	button:hover:not(:disabled) { background: #525252; }
	button:disabled { opacity: .3; }
	button:focus-visible { outline: 2px solid white; outline-offset: 2px; }
	@media (min-width: 1024px) {
		button::after { content: attr(data-tooltip); position: absolute; left: calc(100% + 12px); top: 50%; transform: translateY(-50%); padding: 6px 10px; border: 1px solid #525252; border-radius: 6px; background: #171717; color: white; font-size: 12px; white-space: nowrap; pointer-events: none; opacity: 0; }
		button:hover::after, button:focus-visible::after { opacity: 1; }
	}
</style>
