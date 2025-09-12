<script lang="ts">
	import { onDestroy } from 'svelte';
	import Scroller from '$lib/ui/Scroller.svelte';
	import type { ExporterSessionsResponse } from '../api/exporter/sessions/+server';
	import Modal from '$lib/ui/Modal.svelte';
	import { enhance } from '$app/forms';
	import { app } from '$lib/state/app.svelte';
	import { integrationLogos } from '$lib/ui/integrations';

	type Session = ExporterSessionsResponse['sessions'][number];
	interface Props {
		sessions: ExporterSessionsResponse['sessions'];
		next: number | null;
		onLoaded: (data: ExporterSessionsResponse) => void;
		integrations: string[];
	}

	let { sessions, next, onLoaded, integrations }: Props = $props();

	let scroller = $state<Scroller<Session>>();
	let loading = $state(false);
	let jobStates = $state<Record<number, 'exporting' | 'cancelling'>>({});
	let pollingIntervals: Record<number, ReturnType<typeof setInterval>> = {};

	let albumCreateSession = $state<number>();

	function pollJobStatus(sessionId: number) {
		const intervalId = setInterval(async () => {
			const response = await fetch(`/api/sessions/${sessionId}/export`);

			console.log(`[Polling] Session ${sessionId}: status check returned ${response.status}`);

			if (response.status === 404) {
				// Job is no longer active, so it's done.
				clearInterval(intervalId);
				delete pollingIntervals[sessionId];
				delete jobStates[sessionId];

				const session = sessions.find((s) => s.id === sessionId);
				if (session) {
					session.status = 'Exported';
				}
			}
		}, 2000);

		pollingIntervals[sessionId] = intervalId;
	}

	async function exportSession(sessionId: number) {
		jobStates[sessionId] = 'exporting';
		await fetch(`/api/sessions/${sessionId}/export`, { method: 'POST' });
		pollJobStatus(sessionId);
	}

	async function cancelExport(sessionId: number) {
		jobStates[sessionId] = 'cancelling';
		const intervalId = pollingIntervals[sessionId];
		if (intervalId) {
			clearInterval(intervalId);
			delete pollingIntervals[sessionId];
		}
		await fetch(`/api/sessions/${sessionId}/export`, { method: 'DELETE' });
		delete jobStates[sessionId];
	}

	onDestroy(() => {
		for (const intervalId of Object.values(pollingIntervals)) {
			clearInterval(intervalId);
		}
	});

	function formatDate(dateString: string) {
		if (!dateString) return '';
		return new Date(dateString).toLocaleDateString(undefined, {
			month: 'long',
			day: 'numeric',
			year: 'numeric'
		});
	}
</script>

{#snippet item({ item }: { item: Session })}
	<li class="flex flex-wrap items-center justify-between gap-4 p-4">
		<div class="flex items-start gap-4">
			{#if item.images.length > 0}
				<img src="/api/images/{item.images[0].id}/preview" alt={`${item.name} thumbnail`} class="h-16 w-16 rounded object-cover" />
			{/if}
			<div>
				<div class="flex items-center gap-4">
					<h2 class="text-lg font-semibold text-neutral-200">{item.name}</h2>

					{#if jobStates[item.id] === 'exporting'}
						<span class="inline-flex items-center rounded-full bg-blue-900/50 px-2.5 py-1 text-xs font-medium text-blue-300">
							<span class="me-2 h-2 w-2 animate-pulse rounded-full bg-blue-300"></span>
							Exporting...
						</span>
					{:else if item.status === 'Updated'}
						<span class="inline-flex items-center rounded-full bg-yellow-900/50 px-2.5 py-1 text-xs font-medium text-yellow-300">
							<span class="me-2 h-2 w-2 rounded-full bg-yellow-300"></span>
							Updated
						</span>
					{:else}
						<span class="inline-flex items-center rounded-full bg-neutral-800 px-2.5 py-1 text-xs font-medium text-neutral-400">
							<span class="me-2 h-2 w-2 rounded-full bg-neutral-500"></span>
							Exported
						</span>
					{/if}
				</div>
				<p class="text-sm text-neutral-400">
					{item.images.length} images • {formatDate(item.startedAt)}
				</p>
			</div>
		</div>
		<div class="flex items-center gap-4">
			{#each integrations as integration}
				{@const album = item.albums.find((a) => a.integration === integration)}
				{@const img = integrationLogos[integration]}
				{@const style = 'flex h-10 w-10 items-center justify-center rounded-md p-1 text-white transition-colors hover:bg-neutral-500'}
				{#if album}
					<a href={album?.url} target="_blank" rel="noopener noreferrer" title="View Album on {integration}" class={style}>
						{@html img}
					</a>
				{:else}
					<button onclick={() => (albumCreateSession = item.id)} class="{style} opacity-50 hover:opacity-80" title="Create Album on {integration}">
						{@html img}
					</button>
				{/if}
			{/each}
			{#if jobStates[item.id] === 'exporting'}
				<button
					onclick={() => cancelExport(item.id)}
					class="rounded-md border border-transparent bg-neutral-800 px-4 py-2 text-sm font-semibold text-neutral-300 transition-colors hover:border-neutral-700 hover:bg-neutral-700"
				>
					Cancel
				</button>
			{:else if item.status === 'Updated'}
				<button
					onclick={() => exportSession(item.id)}
					class="rounded-md bg-neutral-50 px-4 py-2 text-sm font-semibold text-neutral-950 shadow-sm transition-colors hover:bg-neutral-200"
				>
					Export
				</button>
			{:else}
				<button
					onclick={() => exportSession(item.id)}
					class="rounded-md border border-transparent bg-neutral-800 px-4 py-2 text-sm font-semibold text-neutral-300 transition-colors hover:border-neutral-700 hover:bg-neutral-700"
				>
					Re-export
				</button>
			{/if}
		</div>
	</li>
{/snippet}

{#snippet empty()}
	<div class="flex h-full flex-col items-center justify-center p-8 text-center">
		<svg xmlns="http://www.w3.org/2000/svg" class="mb-6 h-20 w-20 text-neutral-600" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
			<path
				stroke-linecap="round"
				stroke-linejoin="round"
				d="M9 8.25H7.5a2.25 2.25 0 0 0-2.25 2.25v9a2.25 2.25 0 0 0 2.25 2.25h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25H15m0-3-3-3m0 0-3 3m3-3v11.25"
			/>
		</svg>
		<h2 class="mb-2 text-2xl font-bold text-neutral-200">Nothing to Export</h2>
		<p class="max-w-md text-neutral-400">There are no sessions ready for export. Once you make edits in the gallery, they will appear here.</p>
	</div>
{/snippet}

{#snippet footer()}
	{#if loading}
		<div class="flex justify-center p-4">
			<p class="text-neutral-400">Loading more...</p>
		</div>
	{/if}
{/snippet}

<div class="rounded-lg border border-neutral-800 bg-neutral-900">
	<Scroller
		bind:this={scroller}
		items={sessions}
		{item}
		{empty}
		{footer}
		onMore={async () => {
			if (loading || !next) return;
			loading = true;

			const response = await fetch(`/api/exporter/sessions?cursor=${next}`);
			const result = (await response.json()) as ExporterSessionsResponse;

			onLoaded(result);

			loading = false;
		}}
	></Scroller>
</div>

{#if albumCreateSession}
	<Modal onClose={() => (albumCreateSession = undefined)} class="!max-w-md">
		<div class="border-b border-neutral-700 p-4">
			<h1 class="text-lg font-medium text-neutral-200">Create New Album</h1>
			<p class="text-sm text-neutral-400">Create an album in a connected photo integration.</p>
		</div>
		<form
			method="POST"
			action="?/create-album"
			use:enhance={() => {
				return async ({ result }) => {
					if (result.type === 'success') {
						app.addToast('Album created successfully!', 'success');
						albumCreateSession = undefined;
						// } else if (result.type === 'error') {
						// 	app.addToast(`Failed to create album: ${result.data?.error}`, 'error');
					} else if (result.type === 'failure') {
						app.addToast(`Failed to create album: ${result.data?.error}`, 'error');
					}
				};
			}}
			class="flex flex-col gap-6 p-4"
		>
			<input type="hidden" name="session" value={albumCreateSession} required />

			<div>
				<label for="integration-select" class="mb-1 block text-sm font-medium text-neutral-300">Integration</label>
				<select
					id="integration-select"
					name="integration"
					class="capsitalize w-full rounded-md border-1 border-neutral-400 bg-neutral-900 p-2.5 text-neutral-200 focus:ring-neutral-500"
					required
				>
					{#each integrations as integrationType}
						<option value={integrationType} class="capitalize">{integrationType}</option>
					{/each}
				</select>
			</div>

			<div class="flex justify-end gap-2 pt-2">
				<button class="rounded-md bg-neutral-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-neutral-500" type="submit"> Create Album </button>
			</div>
		</form>
	</Modal>
{/if}
