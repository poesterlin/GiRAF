<script lang="ts">
	import { page } from '$app/state';
	import BasePP3 from '$lib/assets/client.pp3?raw';
	import favicon from '$lib/assets/favicon.svg';
	import { edits } from '$lib/state/editing.svelte';
	import '../app.css';

	let { children } = $props();

	edits.initialize(BasePP3);

	$effect(() => {
		const newPP3 = $state.snapshot(edits.pp3);
		// edits.store();
		edits.updateThrottledPP3(newPP3);
	});

	$effect(() => {
		if (edits.throttledPP3) {
			edits.isLoading = true;
		}
	});

	let currentRoute = $derived(page.route.id);
	let galleryActive = $derived(currentRoute?.startsWith('/gallery'));
	let editorActive = $derived(currentRoute?.startsWith('/editor'));
	let exporterActive = $derived(currentRoute?.startsWith('/exporter'));
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<div class="grid h-screen grid-rows-[auto_1fr] bg-neutral-950 text-neutral-200">
	<header class="border-b border-neutral-800 p-2">
		<nav class="flex justify-center gap-2">
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
	<main class="overflow-y-auto">
		{@render children?.()}
	</main>
</div>
