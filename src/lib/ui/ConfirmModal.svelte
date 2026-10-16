<script lang="ts">
	import Modal from '$lib/ui/Modal.svelte';

	interface Props {
		title: string;
		message: string;
		confirmLabel?: string;
		onConfirm: () => void;
		onCancel: () => void;
	}

	let { title, message, confirmLabel = 'Confirm', onConfirm, onCancel }: Props = $props();
</script>

<Modal onClose={onCancel} class="max-w-[calc(100vw-2rem)]">
	<div class="p-6 text-neutral-100">
		<h2 class="pr-10 text-lg font-semibold">{title}</h2>
		<p class="mt-2 text-sm text-neutral-300">{message}</p>
		<div class="mt-6 flex flex-wrap justify-end gap-3">
			<button type="button" class="min-h-11 rounded-lg border border-neutral-400 px-4 py-2" onclick={onCancel}>Cancel</button>
			<button type="button" class="min-h-11 rounded-lg bg-white px-4 py-2 font-semibold text-black" onclick={onConfirm}>{confirmLabel}</button>
		</div>
	</div>
</Modal>
