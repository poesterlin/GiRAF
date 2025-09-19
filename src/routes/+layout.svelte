<script lang="ts">
	import { page } from '$app/state';
	import favicon from '$lib/assets/favicon.svg';
	import { onNavigate } from '$app/navigation';
	import { app } from '$lib/state/app.svelte';
	import '../app.css';

	let { children } = $props();

	let currentRoute = $derived(page.route?.id);
	let galleryActive = $derived(currentRoute?.startsWith('/gallery'));
	let editorActive = $derived(currentRoute?.startsWith('/editor'));
	let exporterActive = $derived(currentRoute?.startsWith('/exporter'));
	let importerActive = $derived(currentRoute?.startsWith('/importer'));

	onNavigate((navigation) => {
		if (!document.startViewTransition) {
			return;
		}

		return new Promise((resolve) => {
			document.startViewTransition(async () => {
				resolve();
				await navigation.complete;
			});
		});
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<div class="grid h-screen grid-rows-[auto_1fr] bg-neutral-950 text-neutral-200">
	<header class="border-b border-neutral-800 p-2">
		<nav class="flex justify-center gap-2">
			<a
				href="/importer"
				class="rounded-md px-4 py-2 text-neutral-300 transition-colors hover:bg-neutral-900 hover:text-neutral-50"
				class:bg-neutral-800={importerActive}
				class:text-neutral-50={importerActive}
				class:font-semibold={importerActive}
			>
				Importer
			</a>
			<a
				href="/gallery"
				class="rounded-md px-4 py-2 text-neutral-300 transition-colors hover:bg-neutral-900 hover:text-neutral-50"
				class:bg-neutral-800={galleryActive}
				class:text-neutral-50={galleryActive}
				class:font-semibold={galleryActive}
			>
				Gallery
			</a>
			<a
				href="/editor"
				class="rounded-md px-4 py-2 text-neutral-300 transition-colors hover:bg-neutral-900 hover:text-neutral-50"
				class:bg-neutral-800={editorActive}
				class:text-neutral-50={editorActive}
				class:font-semibold={editorActive}
			>
				Editor
			</a>
			<a
				href="/exporter"
				class="rounded-md px-4 py-2 text-neutral-300 transition-colors hover:bg-neutral-900 hover:text-neutral-50"
				class:bg-neutral-800={exporterActive}
				class:text-neutral-50={exporterActive}
				class:font-semibold={exporterActive}
			>
				Exporter
			</a>
		</nav>
	</header>
	<main>
		{@render children?.()}
	</main>
</div>

<!-- toasts -->
<div class="fixed right-4 bottom-4 z-80 flex flex-col items-end gap-2">
	{#each app.toasts as toast (toast.id)}
		{@const bg = {
			success: 'bg-green-600/90',
			error: 'bg-red-600/90',
			info: 'bg-neutral-800/90'
		}[toast.type]}
		<div class="rounded-lg {bg} z-80 px-4 py-2 text-sm font-medium text-neutral-50 shadow-lg backdrop-blur-sm">
			{toast.message}
		</div>
	{/each}
</div>

<style>
	/* @keyframes fade-in {
		from {
			opacity: 0;
		}
	}

	@keyframes fade-out {
		to {
			opacity: 0;
		}
	} */

	/* ::view-transition-old(root) {
		animation: 90ms cubic-bezier(0.4, 0, 1, 1) both fade-out;
	}

	::view-transition-new(root) {
		animation: 210ms cubic-bezier(0, 0, 0.2, 1) 90ms both fade-in;
	} */
</style>
