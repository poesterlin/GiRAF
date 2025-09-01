<script lang="ts">
	import { IconX } from '@tabler/icons-svelte';
	import { onMount, type Snippet } from 'svelte';
	import { fade } from 'svelte/transition';

	interface Props {
		children: Snippet;
		onClose: () => void;
		class?: string;
	}

	let dialog: HTMLDialogElement;
	let hasBackdrop = $state(true);

	let { children, onClose, ...rest }: Props = $props();

	onMount(() => {
		dialog.showModal();
		hasBackdrop = true;
	});

	function handleOutsideClick(event: MouseEvent) {
		if (event.target === dialog) {
			handleClose();
		}
	}

	function handleClose() {
		hasBackdrop = false;
		onClose();
	}

	function trapFocus(event: KeyboardEvent) {
		const focusableElements = dialog.querySelectorAll(
			'a[href], area[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"])'
		);
		const firstElement = focusableElements[0] as HTMLElement;
		const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement;

		if (event.target === lastElement && event.key === 'Tab' && !event.shiftKey) {
			event.preventDefault();
			firstElement.focus();
		} else if (event.target === firstElement && event.key === 'Tab' && event.shiftKey) {
			event.preventDefault();
			lastElement.focus();
		}
	}
</script>

<dialog
	in:fade={{ duration: 200 }}
	class="glass relative relative m-auto transform overflow-auto w-xl rounded-xl !bg-neutral-900 text-left shadow-xl transition-all {rest.class}"
	bind:this={dialog}
	onclick={handleOutsideClick}
	onkeydown={trapFocus}
    onclose={handleClose}
>
	<button
		autofocus
		class="focus:ring-opacity-50 absolute top-3 right-3 z-10 rounded-full p-2 text-gray-500 hover:bg-gray-200 focus:ring-2 focus:ring-gray-400 focus:outline-none"
		onclick={handleClose}
	>
		<IconX></IconX>
	</button>

	{@render children()}
</dialog>

<style>
	dialog::backdrop {
		background-color: rgba(0, 0, 0, 0.5);
		opacity: 1;
		z-index: 40;
	}
</style>