<script lang="ts">
	import { uploads } from '$lib/state/uploads.svelte';
</script>

{#if uploads.isUploading}
	<div class="upload-track" class:preparing={uploads.progress === 0}>
		<progress class="upload-progress w-full" value={uploads.progress} max="100" aria-label={uploads.progress === 0 ? 'Preparing uploads' : 'Upload progress'}></progress>
	</div>
{/if}

<style>
	.upload-track {
		overflow: hidden;
	}
	.preparing {
		animation: preparing 2.4s ease-in-out infinite alternate;
	}
	@keyframes preparing {
		from { opacity: 0.45; }
		to { opacity: 1; }
	}
	@media (prefers-reduced-motion: reduce) {
		.preparing {
			animation: none;
		}
	}
	.upload-progress {
		appearance: none;
		display: block;
		height: 2px;
		overflow: hidden;
		border: 0;
		border-radius: 9999px;
		background: #262626;
		color: #d4d4d4;
	}
	.upload-progress::-webkit-progress-bar {
		background: #262626;
	}
	.upload-progress::-webkit-progress-value {
		background: #d4d4d4;
		transition: width 180ms linear;
	}
	.upload-progress::-moz-progress-bar {
		background: #d4d4d4;
	}
</style>
