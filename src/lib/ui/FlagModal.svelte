<script lang="ts">
	import Modal from '$lib/ui/Modal.svelte';
	import { browser } from '$app/environment';
	import TagInput from './TagInput.svelte';
	import { tagStore } from '$lib/state/tag.svelte';
	import { invalidateAll } from '$app/navigation';

	interface Props {
		img: string;
		onClose: () => void;
	}

	let { img, onClose }: Props = $props();

	async function save() {
		if (!browser) return;

		await fetch(`/api/images/${img}/flag`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({ tags: tagStore.selected })
		});
		
		await invalidateAll();
		onClose();
	}
</script>

<Modal {onClose}>
	<div class="mx-auto p-6 pt-8 text-white">
		<TagInput></TagInput>

		<div class="mt-2 flex justify-end space-x-3 border-t border-neutral-700 pt-4">
			<button class="rounded-md px-4 py-2 font-medium text-neutral-300 transition-colors duration-200 hover:bg-neutral-800 hover:text-white" onclick={onClose}> Cancel </button>
			<button class="rounded-md bg-neutral-700 px-4 py-2 font-medium text-white shadow-sm transition-colors duration-200 hover:bg-neutral-600" onclick={save}> Save </button>
		</div>
	</div>
</Modal>
