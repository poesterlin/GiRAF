<script lang="ts">
	import { uploads } from '$lib/state/uploads.svelte';
</script>

{#if uploads.isUploading}
	<progress class="upload-progress h-1 w-full" value={uploads.progress} max="100" aria-label="Upload progress"></progress>
{/if}

<style>
	.upload-progress {
		appearance: none;
		display: block;
		overflow: hidden;
		border: 1px solid #737373;
		border-radius: 9999px;
		background: #262626;
		color: #fff;
	}
	.upload-progress::-webkit-progress-bar {
		background: #262626;
	}
	.upload-progress::-webkit-progress-value {
		background: #fff;
	}
	.upload-progress::-moz-progress-bar {
		background: #fff;
	}
</style>
