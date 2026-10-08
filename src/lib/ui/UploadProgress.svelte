<script lang="ts">
	import { uploads } from '$lib/state/uploads.svelte';
</script>

{#if uploads.visible}
	<div class="rounded-xl border border-neutral-500 bg-neutral-950 p-3" role="status">
		<div class="flex items-center justify-between gap-3">
			<p class="text-sm font-medium text-neutral-100">
				{uploads.isUploading ? 'Uploading files' : uploads.failed ? 'Upload finished with errors' : 'Upload complete'}
			</p>
			{#if !uploads.isUploading}
				<button type="button" class="text-xs text-neutral-200 hover:text-white" onclick={() => (uploads.visible = false)}>Dismiss</button>
			{/if}
		</div>
		<p class="mt-1 text-xs text-neutral-200">
			{uploads.completed} / {uploads.total} files processed · {uploads.progress}%
			{#if uploads.failed} · {uploads.failed} failed{/if}
		</p>
		<progress class="upload-progress mt-2 h-2 w-full" value={uploads.progress} max="100" aria-label="Upload progress"></progress>
	</div>
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
