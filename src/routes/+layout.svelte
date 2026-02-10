<script lang="ts">
	import { page } from '$app/state';
	import logo from '$lib/assets/logo.webp';
	import { onNavigate } from '$app/navigation';
	import { app } from '$lib/state/app.svelte';
	import { edits } from '$lib/state/editing.svelte';
	import {
		IconCameraFilled,
		IconCameraPlus,
		IconLayoutGrid,
		IconFlag,
		IconAdjustmentsHorizontal,
		IconArchive,
		IconBell,
		IconSettings,
		IconUser
	} from '$lib/ui/icons';
	import '../app.css';

	let { children, data } = $props();

	let currentRoute = $derived(page.route?.id);
	let galleryActive = $derived(currentRoute?.startsWith('/gallery'));
	let editorActive = $derived(currentRoute?.startsWith('/editor'));
	let exporterActive = $derived(currentRoute?.startsWith('/exporter'));
	let importerActive = $derived(currentRoute?.startsWith('/importer'));
	let triageActive = $derived(currentRoute?.startsWith('/triage'));

	let triageEnabled = $derived(data.triageEnabled);

	$effect(() => {
		edits.update(edits.pp3);
	});

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
	<link rel="icon" href={logo} />
</svelte:head>

<div class="grid h-screen grid-rows-[auto_1fr] bg-neutral-950 text-neutral-200 font-sans">
	<header
		class="z-50 flex items-center justify-between border-b border-neutral-800/50 bg-neutral-950/80 px-3 py-3 backdrop-blur-md sm:px-6"
	>
		<!-- Brand -->
		<a href="/" class="flex items-center gap-2 sm:gap-3">
			<img src={logo} alt="GiRAF Logo" class="h-8 w-8 sm:h-9 sm:w-9 rounded-full" />
			<span class="hidden text-base font-bold tracking-tight text-neutral-100 sm:text-lg lg:block uppercase">
				Gi<span class="font-light text-neutral-500">RAF</span>
			</span>
		</a>

		<!-- Main Nav -->
		<nav class="flex items-center rounded-full border border-neutral-800/50 bg-neutral-900/40 p-1 shadow-inner">
			<a
				href="/importer"
				class="flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium transition-all sm:px-4"
				class:bg-neutral-100={importerActive}
				class:text-neutral-950={importerActive}
				class:text-neutral-400={!importerActive}
				class:hover:text-neutral-100={!importerActive}
			>
				<IconCameraPlus size={18} />
				<span class="hidden md:block">Import</span>
			</a>
			<a
				href="/gallery"
				class="flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium transition-all sm:px-4"
				class:bg-neutral-100={galleryActive}
				class:text-neutral-950={galleryActive}
				class:text-neutral-400={!galleryActive}
				class:hover:text-neutral-100={!galleryActive}
			>
				<IconLayoutGrid size={18} />
				<span class="hidden md:block">Gallery</span>
			</a>
			{#if triageEnabled}
				<a
					href="/triage"
					class="flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium transition-all sm:px-4"
					class:bg-neutral-100={triageActive}
					class:text-neutral-950={triageActive}
					class:text-neutral-400={!triageActive}
					class:hover:text-neutral-100={!triageActive}
				>
					<IconFlag size={18} />
					<span class="hidden md:block">Triage</span>
				</a>
			{/if}
			<a
				href="/editor"
				class="flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium transition-all sm:px-4"
				class:bg-neutral-100={editorActive}
				class:text-neutral-950={editorActive}
				class:text-neutral-400={!editorActive}
				class:hover:text-neutral-100={!editorActive}
			>
				<IconAdjustmentsHorizontal size={18} />
				<span class="hidden md:block">Editor</span>
			</a>
			<a
				href="/exporter"
				class="flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium transition-all sm:px-4"
				class:bg-neutral-100={exporterActive}
				class:text-neutral-950={exporterActive}
				class:text-neutral-400={!exporterActive}
				class:hover:text-neutral-100={!exporterActive}
			>
				<IconArchive size={18} />
				<span class="hidden md:block">Export</span>
			</a>
		</nav>

		<!-- Utilities -->
		<div class="flex items-center gap-2">
			<!-- <button
				class="relative flex h-8 w-8 items-center justify-center rounded-full text-neutral-400 transition-colors hover:bg-neutral-900 hover:text-neutral-100 sm:h-9 sm:w-9"
			>
				<IconBell size={20} />
				<span class="absolute top-1.5 right-1.5 flex h-2 w-2 sm:top-2 sm:right-2">
					<span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-neutral-400 opacity-75"
					></span>
					<span class="relative inline-flex h-2 w-2 rounded-full bg-neutral-500"></span>
				</span>
			</button> -->
			<a
				href="/settings"
				class="flex h-8 w-8 items-center justify-center rounded-full border border-neutral-800 bg-neutral-900 text-neutral-400 transition-colors hover:border-neutral-700 hover:text-neutral-100 sm:h-9 sm:w-9"
			>
				<IconUser size={20} />
		</a>
		</div>
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
	}

	::view-transition-old(root) {
		animation: 90ms cubic-bezier(0.4, 0, 1, 1) both fade-out;
	}

	::view-transition-new(root) {
		animation: 210ms cubic-bezier(0, 0, 0.2, 1) 90ms both fade-in;
	} */

	:global(main) {
		position: relative;
		overflow: hidden;
	}
</style>
