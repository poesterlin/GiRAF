<script lang="ts">
	import { uploads } from '$lib/state/uploads.svelte';
</script>

{#if uploads.visible}
	<div class="rounded-xl border border-neutral-800 bg-neutral-900 p-3" role="status">
		<div class="flex items-center justify-between gap-3">
			<p class="text-sm font-medium text-neutral-100">
				{uploads.isUploading ? 'Uploading files' : uploads.failed ? 'Upload finished with errors' : 'Upload complete'}
			</p>
			{#if !uploads.isUploading}
				<button type="button" class="text-xs text-neutral-400 hover:text-neutral-100" onclick={() => (uploads.visible = false)}>Dismiss</button>
			{/if}
		</div>
		<p class="mt-1 text-xs text-neutral-400">
			{uploads.completed} / {uploads.total} files processed · {uploads.progress}%
			{#if uploads.failed} · {uploads.failed} failed{/if}
		</p>
		<progress class="mt-2 h-2 w-full accent-neutral-100" value={uploads.progress} max="100" aria-label="Upload progress"></progress>
		{#if uploads.isUploading}
			<p class="mt-1 text-xs text-neutral-500">You can navigate the site while uploads continue.</p>
		{/if}
	</div>
{/if}
