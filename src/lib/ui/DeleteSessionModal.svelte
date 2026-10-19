<script lang="ts">
	import Modal from '$lib/ui/Modal.svelte';
	import Checkbox from '$lib/ui/Checkbox.svelte';
	import type { ArchivedSession } from '$lib/server/library';

	let {
		session,
		busy = false,
		onConfirm,
		onCancel
	}: {
		session: ArchivedSession;
		busy?: boolean;
		onConfirm: (files: { imports: boolean; exports: boolean }) => void;
		onCancel: () => void;
	} = $props();

	// The files are the user's originals, so they are kept unless explicitly asked for.
	let imports = $state(false);
	let exports = $state(false);
</script>

<Modal onClose={onCancel} class="max-w-[calc(100vw-2rem)]">
	<div class="p-6 text-neutral-100">
		<h2 class="pr-10 text-lg font-semibold">Delete “{session.name}”?</h2>
		<p class="mt-2 text-sm text-neutral-300">
			This permanently removes the session, its {session.totalImageCount}
			photo{session.totalImageCount === 1 ? '' : 's'} and every edit. Cached previews and intermediates are always cleared.
		</p>

		<fieldset class="mt-5 rounded-xl border border-neutral-800 p-3" disabled={busy}>
			<legend class="px-1 text-xs font-semibold tracking-wide text-neutral-500 uppercase">Also delete files</legend>
			<Checkbox bind:checked={imports} label="Imported RAW files" />
			<Checkbox bind:checked={exports} label="Exported JPEGs" />
			<p class="pt-1 text-xs text-neutral-500">Leave these off to keep the files on disk.</p>
		</fieldset>

		<div class="mt-6 flex flex-wrap justify-end gap-3">
			<button type="button" class="min-h-11 rounded-lg border border-neutral-400 px-4 py-2" disabled={busy} onclick={onCancel}>Cancel</button>
			<button
				type="button"
				class="min-h-11 rounded-lg bg-red-600 px-4 py-2 font-semibold text-white disabled:opacity-50"
				disabled={busy}
				onclick={() => onConfirm({ imports, exports })}
			>
				{busy ? 'Deleting…' : 'Delete session'}
			</button>
		</div>
	</div>
</Modal>
