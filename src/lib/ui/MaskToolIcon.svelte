<script lang="ts">
	let { size = 20 }: { size?: number } = $props();
</script>

<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
	<ellipse cx="12" cy="12" rx="8" ry="6" stroke-dasharray="3 2" />
	<path d="M9 12h6m-3-3v6" />
</svg>
