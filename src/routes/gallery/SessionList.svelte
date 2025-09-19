<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import Scroller from '$lib/ui/Scroller.svelte';
	import type { SessionsResponse } from '../api/sessions/+server';
	import { IconAdjustmentsFilled, IconArchive, IconTransferIn } from '$lib/ui/icons';
	import { app } from '$lib/state/app.svelte';

	type Session = SessionsResponse['sessions'][number];
	interface Props {
		sessions: SessionsResponse['sessions'];
		next: number | null;
		onLoaded: (data: SessionsResponse) => void;
	}

	let { sessions, next, onLoaded }: Props = $props();

	let initialImports = $derived(sessions.filter((s) => s.isImporting).map((s) => s.id));

	let scroller = $state<Scroller<Session>>();
	let loading = $state(false);
	let importJobStates = $derived<Set<number>>(new Set(initialImports));

	$effect(() => {
		for (const session of initialImports) {
			checkForCompletedJob(session);
		}
	});

	async function importSession(sessionId: number) {
		importJobStates.add(sessionId);
		const response = await fetch(`/api/sessions/${sessionId}/import`, { method: 'POST' });

		if (!response.ok && response.status !== 409) {
			// Handle unexpected errors, maybe show a toast notification
			console.error('Failed to start import job', await response.text());
			// Reset state on failure
			importJobStates.delete(sessionId);
			app.addToast('Failed to start import job', 'error');
			await invalidateAll();
		}

		checkForCompletedJob(sessionId);
	}

	function checkForCompletedJob(sessionId: number) {
		const interval = setInterval(async () => {
			const statusResponse = await fetch(`/api/sessions/${sessionId}/import`);
			if (!statusResponse.ok) {
				console.error('Failed to fetch import job status', await statusResponse.text());
				clearInterval(interval);
				await invalidateAll();
				app.addToast('Import job completed successfully', 'success');
				importJobStates.delete(sessionId);
				return;
			}
		}, 8000);
	}

	export function capture() {
		return scroller?.capture();
	}

	export function restore(values: any) {
		scroller?.restore(values);
	}

	async function archiveSession(sessionId: number) {
		if (!confirm('Are you sure you want to archive this session? This will hide all its images from the gallery.')) {
			return;
		}
		const res = await fetch(`/api/sessions/${sessionId}/archive`, { method: 'POST' });
		if (res.ok) {
			sessions = sessions.filter((s) => s.id !== sessionId);
			await invalidateAll();
		} else {
			alert('Failed to archive session.');
		}
	}

	const intl = new Intl.DateTimeFormat('de-DE', {
		day: '2-digit',
		month: '2-digit',
		year: 'numeric'
	});
	function formatDate(date: Date) {
		return intl.format(new Date(date));
	}
</script>

{#snippet item({ item }: { item: Session })}
	<section class="mx-4 pt-6">
		<div class="sticky top-0 z-10 mb-2 flex items-center justify-between bg-neutral-950 py-4">
			<div class="flex items-center gap-4">
				<h2 class="text-xl font-semibold text-neutral-200 sm:text-2xl">{item.name}</h2>
				<p class="rounded-full bg-neutral-200 px-2 text-neutral-900">{item.imageCount}</p>
				{#if importJobStates.has(item.id)}
					<span class="inline-flex items-center rounded-full bg-blue-900/50 px-2.5 py-1 text-xs font-medium text-blue-300">
						<span class="me-2 h-2 w-2 animate-pulse rounded-full bg-blue-300"></span>
						Processing...
					</span>
				{:else}
					<button
						aria-label="Reprocess Session Images"
						onclick={() => importSession(item.id)}
						title="Process Session Images"
						class="text-neutral-400 transition-colors hover:text-neutral-100"
					>
						<IconTransferIn></IconTransferIn>
					</button>
				{/if}
				<button onclick={() => archiveSession(item.id)} aria-label="Archive Session" title="Archive Session" class="text-neutral-400 transition-colors hover:text-neutral-100">
					<IconArchive></IconArchive>
				</button>
			</div>
			<p class="ml-4 flex-shrink-0 text-neutral-400">{formatDate(item.startedAt)}</p>
		</div>
		<div class="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
			{#each item.images as preview}
				<a
					href={`/editor/${preview.id}`}
					class="group relative block aspect-[3/2] overflow-hidden rounded-lg bg-neutral-900 ring-1 ring-transparent transition hover:ring-neutral-700"
				>
					<img
						src="/api/images/{preview.id}/preview?version={preview.version}"
						alt=""
						loading="lazy"
						class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
					/>
					<!-- <div class="absolute top-2 right-2 rounded bg-black/50 px-2 py-1 text-xs text-white">
						{preview.stackChildren.length + 1}
					</div> -->
					{#if preview.isArchived}
						<div class="absolute top-2 right-2 rounded bg-black/50 px-2 py-1 text-xs text-white">
							<IconArchive />
						</div>
					{:else if preview.hasSnapshot}
						<div class="absolute top-2 right-2 rounded bg-black/50 px-2 py-1 text-xs text-white">
							<IconAdjustmentsFilled />
						</div>
					{/if}
				</a>
			{:else}
				<div class="flex aspect-[3/2] items-center justify-center rounded-lg bg-neutral-900 text-neutral-500">
					<span class="text-sm">No Images</span>
				</div>
			{/each}
		</div>
	</section>
{/snippet}

{#snippet empty()}
	<div class="flex h-full flex-col items-center justify-center rounded-lg border border-neutral-800 bg-neutral-900 p-8 text-center">
		<svg xmlns="http://www.w3.org/2000/svg" class="mb-6 h-20 w-20 text-neutral-600" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
			<path
				stroke-linecap="round"
				stroke-linejoin="round"
				d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.158 0a.075.075 0 0 1 .075-.075h.009a.075.075 0 0 1 .075.075v.009a.075.075 0 0 1-.075.075h-.009a.075.075 0 0 1-.075-.075V8.25Z"
			/>
		</svg>
		<h2 class="mb-2 text-2xl font-bold text-neutral-200">Your Gallery is Empty</h2>
		<p class="max-w-md text-neutral-400">It looks like you haven't created any sessions yet. Start a new editing session to see your photos here.</p>
	</div>
{/snippet}

{#snippet footer()}
	{#if loading}
		<div class="flex justify-center p-4">
			<p class="text-neutral-400">Loading more...</p>
		</div>
	{/if}
{/snippet}

<Scroller
	bind:this={scroller}
	items={sessions}
	{item}
	{empty}
	{footer}
	onMore={async () => {
		if (loading || !next) return;
		loading = true;

		const response = await fetch(`/api/sessions?offset=${next}`);
		const result = (await response.json()) as SessionsResponse;

		onLoaded(result);

		loading = false;
	}}
></Scroller>

<style>
	.grayscale {
		filter: grayscale(100%);
	}
</style>
