<script lang="ts">
	import { page } from '$app/state';
	import { flowNavState } from '$lib/flow-nav';
	import { IconChevronLeft } from '$lib/ui/icons';

	let {
		triageEnabled,
		sessionName = null,
		sessionId = null
	}: { triageEnabled: boolean; sessionName?: string | null; sessionId?: number | null } = $props();

	const linkBase =
		'flex shrink-0 items-center rounded-full px-2.5 py-1.5 text-xs font-medium whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-200 sm:px-3.5 sm:text-sm';
	const activeLink = `${linkBase} bg-neutral-800/70 text-neutral-100`;
	const idleLink = `${linkBase} text-neutral-500 hover:text-neutral-100`;

	let nav = $derived(flowNavState({ pathname: page.url.pathname, triageEnabled, sessionName }));
	let inSession = $derived(nav.sessionStage !== null && nav.sessionName !== null);
	let inGallerySession = $derived(nav.activePage === 'gallery' && sessionId !== null && sessionName !== null);
</script>

<nav aria-label="Workflow" class="flex min-w-0 items-center">
	<a href="/importer" class={nav.activePage === 'import' ? activeLink : idleLink}>Import</a>

	<span class="mx-1 hidden h-3 w-px shrink-0 bg-white/10 sm:block" aria-hidden="true"></span>

	{#if inSession}
		<div class="flex min-w-0 shrink items-center gap-1.5 rounded-full bg-neutral-800/70 px-2.5 py-1.5 sm:px-3">
			<a
				href={sessionId ? `/gallery?session=${sessionId}` : '/gallery'}
				class="flex min-w-0 items-center gap-0.5 text-xs font-medium whitespace-nowrap text-neutral-400 transition-colors hover:text-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-200 sm:text-sm"
				aria-label={`Back to gallery, session ${nav.sessionName}`}
				title={nav.sessionName ?? ''}
			>
				<IconChevronLeft size={14} class="shrink-0" aria-hidden="true" />
				<span aria-hidden="true" class="max-w-[4rem] truncate sm:max-w-[12rem]">{nav.sessionName}</span>
			</a>
			<span class="shrink-0 text-xs text-neutral-600" aria-hidden="true">/</span>
			<span class="shrink-0 text-xs font-semibold whitespace-nowrap text-neutral-100 sm:text-sm">{nav.stageLabel}</span>
			<span class="flex shrink-0 items-center gap-1" aria-hidden="true">
				{#each nav.stageSteps as step (step.key)}
					<span class="flow-step" class:flow-step-done={step.done} class:flow-step-active={step.active}></span>
				{/each}
			</span>
		</div>
	{:else if inGallerySession}
		<div class="flex min-w-0 shrink items-center gap-1.5 rounded-full bg-neutral-800/70 px-2.5 py-1.5 sm:px-3">
			<a
				href="/gallery"
				class="flex min-w-0 items-center gap-0.5 text-xs font-medium whitespace-nowrap text-neutral-400 transition-colors hover:text-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-200 sm:text-sm"
				aria-label="Back to gallery"
			>
				<IconChevronLeft size={14} class="shrink-0" aria-hidden="true" />
				<span>Gallery</span>
			</a>
			<span class="shrink-0 text-xs text-neutral-600" aria-hidden="true">/</span>
			<span class="max-w-[6rem] truncate text-xs font-semibold whitespace-nowrap text-neutral-100 sm:max-w-[14rem] sm:text-sm" title={sessionName ?? ''}>{sessionName}</span>
		</div>
	{:else}
		<a href="/gallery" class={nav.activePage === 'gallery' ? activeLink : idleLink}>Gallery</a>
	{/if}

	<span class="mx-1 hidden h-3 w-px shrink-0 bg-white/10 sm:block" aria-hidden="true"></span>

	<a href="/exporter" class={nav.activePage === 'export' ? activeLink : idleLink}>Export</a>
</nav>

<style>
	.flow-step {
		width: 4px;
		height: 4px;
		border-radius: 9999px;
		background: rgb(255 255 255 / 0.28);
		transition:
			width 160ms ease,
			background-color 160ms ease;
	}

	.flow-step-done {
		background: rgb(255 255 255 / 0.45);
	}

	.flow-step-active {
		width: 10px;
		background: rgb(255 255 255 / 0.85);
	}
</style>
