<script lang="ts">
	import { uploads } from '$lib/state/uploads.svelte';
</script>

{#if uploads.isUploading}
	<div class="upload-track" class:preparing={uploads.progress === 0}>
		<progress class="upload-progress h-1 w-full" value={uploads.progress} max="100" aria-label={uploads.progress === 0 ? 'Preparing uploads' : 'Upload progress'}></progress>
	</div>
{/if}

<style>
	.upload-track {
		position: relative;
		overflow: hidden;
	}
	.preparing::after {
		content: '';
		position: absolute;
		top: 0;
		left: 0;
		width: 25%;
		height: 100%;
		background: #fff;
		animation: preparing 2s ease-in-out infinite alternate;
	}
	@keyframes preparing {
		to {
			transform: translateX(300%);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.preparing::after {
			animation: none;
			opacity: 0.5;
		}
	}
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
