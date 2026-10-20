<script lang="ts">
	import { onDestroy } from 'svelte';
	import Scroller from '$lib/ui/Scroller.svelte';
	import Tooltip from '$lib/ui/Tooltip.svelte';
	import type { ExporterSessionsResponse } from '../api/exporter/sessions/+server';
	import Modal from '$lib/ui/Modal.svelte';
	import { enhance } from '$app/forms';
	import { app } from '$lib/state/app.svelte';
	import { integrationLogos } from '$lib/ui/integrations';
	import { invalidateAll } from '$app/navigation';
	import { IconFileExport, IconSearch } from '@tabler/icons-svelte';
	import type { AlbumLookupResponse } from '../api/integrations/[integration]/albums/lookup/+server';

	type Session = ExporterSessionsResponse['sessions'][number];
	type LookupAlbum = AlbumLookupResponse['albums'][number];
	interface Props {
		sessions: ExporterSessionsResponse['sessions'];
		next: number | null;
		onLoaded: (data: ExporterSessionsResponse) => void;
		integrations: string[];
		linkableIntegrations: string[];
	}

	let { sessions, next, onLoaded, integrations, linkableIntegrations }: Props = $props();

	let loading = $state(false);
	let jobStates = $state<Record<number, ExportJobState>>({});
	let pollingIntervals: Record<number, ReturnType<typeof setInterval>> = {};

	let albumCreateSession = $state<number>();
	let albumDeleteId = $state<number>();
	let albumCreateIntegration = $state<string>();
	let albumMode = $state<'new' | 'existing'>('new');
	let albumQuery = $state('');
	let albumResults = $state<LookupAlbum[]>([]);
	let albumLookupStatus = $state<'idle' | 'loading' | 'ready' | 'error'>('idle');
	let albumLookupError = $state('');
	let selectedAlbumId = $state<string>();
	let lookupRequest = 0;

	let canLinkExisting = $derived(!!albumCreateIntegration && linkableIntegrations.includes(albumCreateIntegration));
	let selectedAlbum = $derived(albumResults.find((album) => album.id === selectedAlbumId));
	let selectedAlbumLinked = $derived(!!selectedAlbum?.linkedSessions.some((session) => session.id === albumCreateSession));
	let albumSessionName = $derived(sessions.find((session) => session.id === albumCreateSession)?.name);

	function openAlbumModal(sessionId: number, integration: string) {
		albumCreateSession = sessionId;
		albumCreateIntegration = integration;
		albumMode = 'new';
		albumQuery = '';
		albumResults = [];
		albumLookupStatus = 'idle';
		selectedAlbumId = undefined;
	}

	function closeAlbumModal() {
		lookupRequest++;
		albumCreateSession = undefined;
		albumCreateIntegration = undefined;
	}

	async function lookupAlbums(integration: string, sessionId: number, query: string) {
		const request = ++lookupRequest;
		albumLookupStatus = 'loading';
		albumLookupError = '';

		try {
			const params = [`session=${sessionId}`];
			if (query.trim()) params.push(`query=${encodeURIComponent(query.trim())}`);
			const response = await fetch(`/api/integrations/${encodeURIComponent(integration)}/albums/lookup?${params.join('&')}`);
			if (!response.ok) {
				const body = (await response.json().catch(() => null)) as { message?: string } | null;
				throw new Error(body?.message ?? 'Could not load albums.');
			}
			const data = (await response.json()) as AlbumLookupResponse;
			if (request !== lookupRequest) return;

			albumResults = data.albums;
			albumLookupStatus = 'ready';
			if (selectedAlbumId && !data.albums.some((album) => album.id === selectedAlbumId)) {
				selectedAlbumId = undefined;
			}
		} catch (error) {
			if (request !== lookupRequest) return;
			console.error('[Exporter] Album lookup failed', error);
			albumLookupError = error instanceof Error ? error.message : 'Could not load albums.';
			albumLookupStatus = 'error';
		}
	}

	// Fetch when the lookup panel opens, and debounce as the query changes.
	$effect(() => {
		if (!albumCreateSession || albumMode !== 'existing' || !canLinkExisting || !albumCreateIntegration) return;

		const integration = albumCreateIntegration;
		const sessionId = albumCreateSession;
		const query = albumQuery;
		const timer = setTimeout(() => void lookupAlbums(integration, sessionId, query), query ? 250 : 0);
		return () => clearTimeout(timer);
	});

	type ExportJobStatus = 'idle' | 'running' | 'cancelling' | 'success' | 'error' | 'cancelled';
	type ExportJobState = {
		status: ExportJobStatus;
		message?: string;
	};

	$effect(() => {
		for (const session of sessions) {
			if (jobStates[session.id]) continue;
			jobStates[session.id] = session.exportJob;
			if (session.exportJob.status === 'running') pollJobStatus(session.id);
		}
	});

	function exportState(session: Session) {
		return jobStates[session.id] ?? session.exportJob;
	}

	function stopPolling(sessionId: number) {
		const intervalId = pollingIntervals[sessionId];
		if (!intervalId) return;
		clearInterval(intervalId);
		delete pollingIntervals[sessionId];
	}

	function pollJobStatus(sessionId: number) {
		stopPolling(sessionId);
		const intervalId = setInterval(async () => {
			try {
				const response = await fetch(`/api/sessions/${sessionId}/export`);
				if (!response.ok) {
					throw new Error('Failed to check export status');
				}

				const state = (await response.json()) as ExportJobState;
				if (state.status === 'running') {
					return;
				}

				stopPolling(sessionId);
				jobStates[sessionId] = state;

				if (state.status === 'success') {
					app.addToast('Export completed successfully.', 'success');
				} else if (state.status === 'cancelled') {
					app.addToast('Export was cancelled.', 'info');
				} else if (state.status === 'error') {
					app.addToast(state.message ? `Export failed: ${state.message}` : 'Export failed.', 'error');
				}
				await invalidateAll();
			} catch (error) {
				console.error(`[Polling] Session ${sessionId} export status failed`, error);
				stopPolling(sessionId);
				jobStates[sessionId] = { status: 'error', message: 'Unable to check export status. Refresh to check again.' };
				app.addToast('Failed to check export status.', 'error');
			}
		}, 2000);

		pollingIntervals[sessionId] = intervalId;
	}

	async function exportSession(sessionId: number) {
		jobStates[sessionId] = { status: 'running' };
		try {
			const response = await fetch(`/api/sessions/${sessionId}/export`, { method: 'POST' });
			if (!response.ok && response.status !== 409) throw new Error('Failed to start export.');
			app.addToast(response.status === 409 ? 'Export is already running.' : 'Export started.', 'info');
			pollJobStatus(sessionId);
		} catch {
			jobStates[sessionId] = { status: 'error', message: 'Failed to start export.' };
			app.addToast('Failed to start export.', 'error');
		}
	}

	async function cancelExport(sessionId: number) {
		jobStates[sessionId] = { status: 'cancelling' };
		stopPolling(sessionId);
		try {
			const response = await fetch(`/api/sessions/${sessionId}/export`, { method: 'DELETE' });
			if (!response.ok) throw new Error('Failed to cancel export.');
			jobStates[sessionId] = { status: 'cancelled' };
			app.addToast('Export cancellation requested.', 'info');
			await invalidateAll();
		} catch {
			jobStates[sessionId] = { status: 'running' };
			pollJobStatus(sessionId);
			app.addToast('Failed to cancel export.', 'error');
		}
	}

	onDestroy(() => {
		for (const sessionId of Object.keys(pollingIntervals)) {
			stopPolling(Number(sessionId));
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
	{@const state = exportState(item)}
	{@const busy = state.status === 'running' || state.status === 'cancelling'}
	<div
		class="group relative mb-3 overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-900/40 p-4 transition-all hover:border-neutral-700 hover:bg-neutral-900/60 sm:mr-2 sm:mb-6 sm:rounded-3xl sm:p-6"
	>
		<div class="flex flex-col gap-4 md:flex-row md:items-center md:gap-8">
			<div class="flex min-w-0 flex-1 items-start gap-3 sm:gap-6">
				{#if item.images.length > 0}
					<a
						href="/exporter/{item.id}"
						class="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl ring-offset-black transition-all group-hover:ring-2 group-hover:ring-neutral-700 sm:h-24 sm:w-24 sm:rounded-2xl"
					>
						<img src="/api/images/{item.images[0].id}/preview" alt={`${item.name} thumbnail`} loading="lazy" class="h-full w-full object-cover" />
					</a>
				{/if}
				<div class="flex min-w-0 flex-col gap-2">
					<div class="flex flex-wrap items-center gap-2 sm:gap-3">
						<h2 class="w-full text-lg font-bold tracking-tight break-words text-neutral-100 sm:w-auto sm:text-xl"><a href="/exporter/{item.id}">{item.name}</a></h2>

						{#if item.status === 'Updated' && !busy}
							<a
								href="/exporter/{item.id}/changes"
								class="inline-flex items-center gap-1.5 rounded-full border border-neutral-300/20 bg-neutral-500/10 px-3 py-1 text-[10px] font-black tracking-wider text-neutral-100 uppercase transition-colors hover:border-neutral-200/40 hover:bg-neutral-500/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-200"
								aria-label="Changes pending for {item.name}. See what changed."
								title="See what changed since the last export"
							>
								<span class="h-1.5 w-1.5 rounded-full bg-neutral-400"></span>
								Changes Pending
							</a>
						{:else}
							<span
								class="inline-flex items-center gap-1.5 rounded-full border border-neutral-300/20 bg-neutral-500/10 px-3 py-1 text-[10px] font-black tracking-wider text-neutral-100 uppercase"
								role="status"
							>
								<span class="h-1.5 w-1.5 rounded-full bg-neutral-400" class:animate-pulse={busy}></span>
								{busy ? (state.status === 'cancelling' ? 'Cancelling' : 'Exporting') : 'Exported'}
							</span>
						{/if}
					</div>
					<p class="flex flex-wrap gap-x-2 gap-y-1 text-xs font-medium text-neutral-400 sm:text-sm">
						<span>{item.images.length} images</span><span aria-hidden="true" class="text-neutral-600">·</span><span>{formatDate(item.startedAt)}</span>
					</p>

					<div class="mt-2 flex items-center gap-3">
						{#each integrations as integration (integration)}
							{@const album = item.albums.find((a) => a.integration === integration)}
							{@const img = integrationLogos[integration]}
							{#if album}
								<div class="album group/album relative">
									<Tooltip text="View Album on {integration}" position="top">
										<a
											href="/api/integrations/{integration}/albums/{album.id}"
											target="_blank"
											class="flex h-11 w-11 items-center justify-center rounded-xl bg-neutral-800/50 p-2 text-neutral-100 transition-all hover:scale-110 hover:bg-neutral-800 sm:h-9 sm:w-9 sm:p-1.5"
										>
											<!-- eslint-disable-next-line svelte/no-at-html-tags -- img is a static SVG logo from $lib/ui/integrations, not user input -->
											{@html img}
										</a>
									</Tooltip>
									<button
										onclick={(e) => {
											e.preventDefault();
											e.stopPropagation();
											albumDeleteId = album.id;
										}}
										class="album-unlink absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full border border-neutral-700 bg-neutral-800 text-neutral-400 hover:text-white focus-visible:opacity-100"
										title="Remove Link"
										aria-label={`Remove ${integration} album link`}
									>
										<svg
											xmlns="http://www.w3.org/2000/svg"
											width="10"
											height="10"
											viewBox="0 0 24 24"
											fill="none"
											stroke="currentColor"
											stroke-width="3"
											stroke-linecap="round"
											stroke-linejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg
										>
									</button>
								</div>
							{:else}
								<Tooltip text={linkableIntegrations.includes(integration) ? `Create or link Album on ${integration}` : `Create Album on ${integration}`} position="top">
									<button
										onclick={() => openAlbumModal(item.id, integration)}
										class="flex h-11 w-11 items-center justify-center rounded-xl bg-neutral-800/30 p-2 text-neutral-500 opacity-50 transition-all hover:scale-110 hover:bg-neutral-800 hover:text-neutral-100 hover:opacity-100 sm:h-9 sm:w-9 sm:p-1.5"
									>
										<!-- eslint-disable-next-line svelte/no-at-html-tags -- img is a static SVG logo from $lib/ui/integrations, not user input -->
										{@html img}
									</button>
								</Tooltip>
							{/if}
						{/each}
					</div>
				</div>
			</div>

			<div class="flex shrink-0 items-center justify-end gap-3 border-t border-neutral-800 pt-3 md:border-0 md:pt-0">
				<!-- <a
					href="/exporter/{item.id}"
					class="flex items-center gap-2 rounded-2xl border border-neutral-800 bg-neutral-900/50 px-5 py-3 text-xs font-bold text-neutral-400 transition-all hover:bg-neutral-800 hover:text-neutral-100"
				>
					View Details
				</a> -->

				{#if busy}
					<button
						onclick={() => cancelExport(item.id)}
						disabled={state.status === 'cancelling'}
						class="flex items-center gap-2 rounded-2xl bg-neutral-800 px-6 py-3 text-xs font-bold text-neutral-100 transition-all hover:bg-neutral-700"
					>
						{state.status === 'cancelling' ? 'Cancelling…' : 'Cancel'}
					</button>
				{:else if item.status === 'Updated'}
					<button
						onclick={() => exportSession(item.id)}
						class="group/btn flex items-center gap-3 rounded-2xl bg-neutral-100 px-8 py-3 text-xs font-black tracking-tight text-neutral-950 uppercase transition-all hover:scale-105 hover:bg-white"
					>
						<IconFileExport size={14} />
						Export Now
					</button>
				{:else}
					{@const hasAlbums = item.albums.length > 0}
					<button
						onclick={() => exportSession(item.id)}
						class="flex items-center gap-2 rounded-2xl border border-neutral-800 bg-neutral-900/50 px-6 py-3 text-xs font-bold text-neutral-400 transition-all hover:bg-neutral-800 hover:text-neutral-100"
						title={hasAlbums ? 'Sync images to albums' : 'Export the session again'}
					>
						{#if hasAlbums}
							<svg
								xmlns="http://www.w3.org/2000/svg"
								width="14"
								height="14"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2.5"
								stroke-linecap="round"
								stroke-linejoin="round"
								><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" /><path
									d="M16 16h5v5"
								/></svg
							>
							Sync
						{:else}
							<IconFileExport size={14} />
							Re-export
						{/if}
					</button>
				{/if}
			</div>
		</div>
	</div>
{/snippet}

{#snippet empty()}
	<div class="flex h-[40vh] items-center justify-center rounded-[2.5rem] border border-neutral-800 bg-neutral-900/20">
		<div class="text-center">
			<div class="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-3xl bg-neutral-900 text-neutral-700">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					width="40"
					height="40"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="1.5"
					stroke-linecap="round"
					stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg
				>
			</div>
			<h3 class="text-2xl font-black tracking-tighter text-neutral-100 uppercase italic">Nothing to Export</h3>
			<p class="mt-2 font-medium text-neutral-500">Finish some edits in the gallery to see them here.</p>
		</div>
	</div>
{/snippet}

{#snippet footer()}
	{#if loading}
		<div class="flex justify-center py-12">
			<div class="h-6 w-6 animate-spin rounded-full border-2 border-neutral-700 border-t-transparent"></div>
		</div>
	{/if}
{/snippet}

<Scroller
	items={sessions}
	key={(session) => session.id}
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

{#if albumCreateSession}
	<Modal onClose={closeAlbumModal} class="shadow-3xl !max-w-md !rounded-[2.5rem] !border-neutral-800 !bg-neutral-950">
		<div class="p-6 sm:p-10">
			<h1 class="mb-2 text-2xl leading-none font-black tracking-tighter text-neutral-100 uppercase italic sm:text-3xl">
				{albumMode === 'existing' ? 'Link' : 'Create'} <span class="font-light text-neutral-500 not-italic">Album</span>
			</h1>
			<p class="mb-8 leading-relaxed font-medium text-neutral-400">
				{albumMode === 'existing'
					? `Pick an existing album${albumSessionName ? ` for ${albumSessionName}` : ''} and sync this session into it.`
					: 'Sync this session with your connected photo services.'}
			</p>

			{#if canLinkExisting}
				<div class="mb-8 grid grid-cols-2 gap-1 rounded-2xl border border-neutral-800 bg-neutral-900/60 p-1" role="tablist" aria-label="Album source">
					<button
						type="button"
						role="tab"
						aria-selected={albumMode === 'new'}
						class="rounded-xl py-2.5 text-[11px] font-black tracking-widest uppercase transition-colors {albumMode === 'new'
							? 'bg-neutral-800 text-neutral-100'
							: 'text-neutral-500 hover:text-neutral-300'}"
						onclick={() => (albumMode = 'new')}
					>
						New album
					</button>
					<button
						type="button"
						role="tab"
						aria-selected={albumMode === 'existing'}
						class="rounded-xl py-2.5 text-[11px] font-black tracking-widest uppercase transition-colors {albumMode === 'existing'
							? 'bg-neutral-800 text-neutral-100'
							: 'text-neutral-500 hover:text-neutral-300'}"
						onclick={() => (albumMode = 'existing')}
					>
						Existing album
					</button>
				</div>
			{/if}

			{#if integrations.length > 1}
				<div class="mb-8">
					<label for="integration-select" class="mb-3 block text-xs font-bold tracking-widest text-neutral-500 uppercase">Choose Service</label>
					<div class="relative">
						<select
							id="integration-select"
							class="w-full appearance-none rounded-2xl border border-neutral-800 bg-neutral-900/50 p-4 text-base text-neutral-100 capitalize transition-all outline-none focus:border-neutral-100"
							bind:value={albumCreateIntegration}
							onchange={() => {
								selectedAlbumId = undefined;
								albumResults = [];
								albumLookupStatus = 'idle';
								if (!linkableIntegrations.includes(albumCreateIntegration ?? '')) albumMode = 'new';
							}}
						>
							{#each integrations as integrationType (integrationType)}
								<option value={integrationType} class="bg-neutral-900 capitalize">{integrationType}</option>
							{/each}
						</select>
						<div class="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-neutral-500">
							<svg
								xmlns="http://www.w3.org/2000/svg"
								width="16"
								height="16"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="3"
								stroke-linecap="round"
								stroke-linejoin="round"><path d="m6 9 6 6 6-6" /></svg
							>
						</div>
					</div>
				</div>
			{/if}

			{#if albumMode === 'existing' && canLinkExisting}
				<form
					method="POST"
					action="?/link-album"
					use:enhance={() => {
						return async ({ result, update }) => {
							if (result.type === 'success') {
								app.addToast('Album linked successfully!', 'success');
								closeAlbumModal();
							} else if (result.type === 'error') {
								app.addToast('Failed to link album', 'error');
							} else if (result.type === 'redirect') {
								update();
							} else if (result.type === 'failure') {
								app.addToast(`Failed to link album: ${result.data?.error}`, 'error');
							}
							invalidateAll();
						};
					}}
					class="flex flex-col gap-5"
				>
					<input type="hidden" name="session" value={albumCreateSession} required />
					<input type="hidden" name="integration" value={albumCreateIntegration} required />
					<input type="hidden" name="externalId" value={selectedAlbumId ?? ''} required />

					<div>
						<label for="album-search" class="mb-3 block text-xs font-bold tracking-widest text-neutral-500 uppercase">Find Album</label>
						<div class="relative">
							<span class="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-neutral-500">
								<IconSearch size={16} />
							</span>
							<input
								id="album-search"
								type="search"
								bind:value={albumQuery}
								placeholder="Search your albums…"
								autocomplete="off"
								spellcheck="false"
								class="w-full rounded-2xl border border-neutral-800 bg-neutral-900/50 py-4 pr-4 pl-11 text-base text-neutral-100 transition-all outline-none placeholder:text-neutral-600 focus:border-neutral-100"
							/>
						</div>
					</div>

					<div class="max-h-64 min-h-24 overflow-y-auto rounded-2xl border border-neutral-800/70 bg-neutral-900/20">
						{#if albumLookupStatus === 'loading' && albumResults.length === 0}
							<div class="flex h-24 items-center justify-center gap-3 text-sm font-medium text-neutral-500">
								<div class="h-4 w-4 animate-spin rounded-full border-2 border-neutral-700 border-t-transparent"></div>
								Looking up albums…
							</div>
						{:else if albumLookupStatus === 'error'}
							<div class="flex h-24 flex-col items-center justify-center gap-2 px-4 text-center">
								<p class="text-sm font-medium text-neutral-400">{albumLookupError || 'Could not load albums.'}</p>
								<button
									type="button"
									class="text-xs font-bold tracking-wider text-neutral-300 uppercase underline-offset-4 hover:underline"
									onclick={() => lookupAlbums(albumCreateIntegration ?? '', albumCreateSession ?? 0, albumQuery)}
								>
									Try again
								</button>
							</div>
						{:else if albumResults.length === 0}
							<div class="flex h-24 flex-col items-center justify-center px-4 text-center">
								<p class="text-sm font-medium text-neutral-400">{albumQuery.trim() ? 'No albums match your search.' : 'No albums yet on this service.'}</p>
							</div>
						{:else}
							<ul class="divide-y divide-neutral-800/70">
								{#each albumResults as album (album.id)}
									{@const linkedHere = album.linkedSessions.some((session) => session.id === albumCreateSession)}
									<li>
										<button
											type="button"
											disabled={linkedHere}
											onclick={() => (selectedAlbumId = album.id)}
											class="flex w-full items-center gap-3 p-3 text-left transition-colors {linkedHere
												? 'cursor-not-allowed opacity-50'
												: 'hover:bg-neutral-800/50'} {selectedAlbumId === album.id ? 'bg-neutral-800/70' : ''}"
										>
											{#if album.thumbnailUrl}
												<img src={album.thumbnailUrl} alt="" loading="lazy" class="h-11 w-11 shrink-0 rounded-lg bg-neutral-800 object-cover" />
											{:else}
												<div class="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-neutral-800 text-neutral-600">
													<svg
														xmlns="http://www.w3.org/2000/svg"
														width="16"
														height="16"
														viewBox="0 0 24 24"
														fill="none"
														stroke="currentColor"
														stroke-width="2"
														stroke-linecap="round"
														stroke-linejoin="round"
														><rect width="18" height="18" x="3" y="3" rx="2" ry="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" /></svg
													>
												</div>
											{/if}
											<div class="min-w-0 flex-1">
												<p class="truncate text-sm font-semibold text-neutral-200">{album.title}</p>
												<p class="truncate text-xs font-medium text-neutral-500">
													{album.assetCount}
													{album.assetCount === 1 ? 'image' : 'images'}
													{#if album.linkedSessions.length}
														· linked to {album.linkedSessions[0].name}{album.linkedSessions.length > 1 ? ` +${album.linkedSessions.length - 1}` : ''}
													{/if}
												</p>
											</div>
											{#if linkedHere}
												<span class="rounded-full border border-neutral-700 px-2 py-1 text-[10px] font-black tracking-wider text-neutral-400 uppercase">Linked</span>
											{:else if selectedAlbumId === album.id}
												<span class="flex h-5 w-5 items-center justify-center rounded-full bg-neutral-100 text-neutral-950">
													<svg
														xmlns="http://www.w3.org/2000/svg"
														width="12"
														height="12"
														viewBox="0 0 24 24"
														fill="none"
														stroke="currentColor"
														stroke-width="3"
														stroke-linecap="round"
														stroke-linejoin="round"><path d="M20 6 9 17l-5-5" /></svg
													>
												</span>
											{/if}
										</button>
									</li>
								{/each}
							</ul>
						{/if}
					</div>

					<div class="flex flex-col gap-3 pt-1">
						<button
							class="w-full rounded-2xl bg-neutral-100 py-4 text-sm font-black tracking-tight text-neutral-950 transition-all hover:scale-[1.02] hover:bg-white disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100"
							type="submit"
							disabled={!selectedAlbum || selectedAlbumLinked}
						>
							{selectedAlbumLinked ? 'ALREADY LINKED' : selectedAlbum ? 'LINK ALBUM' : 'SELECT AN ALBUM'}
						</button>
						<button type="button" onclick={closeAlbumModal} class="w-full py-2 text-sm font-bold text-neutral-600 transition-colors hover:text-neutral-400"> Nevermind </button>
					</div>
				</form>
			{:else}
				<form
					method="POST"
					action="?/create-album"
					use:enhance={() => {
						return async ({ result, update }) => {
							if (result.type === 'success') {
								app.addToast('Album created successfully!', 'success');
								closeAlbumModal();
							} else if (result.type === 'error') {
								app.addToast(`Failed to create album`, 'error');
							} else if (result.type === 'redirect') {
								update();
							} else if (result.type === 'failure') {
								app.addToast(`Failed to create album: ${result.data?.error}`, 'error');
							}
							invalidateAll();
						};
					}}
					class="flex flex-col gap-8"
				>
					<input type="hidden" name="session" value={albumCreateSession} required />
					<input type="hidden" name="integration" value={albumCreateIntegration} required />

					<p class="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-4 text-sm leading-relaxed font-medium text-neutral-400">
						Creates a new album named <span class="font-semibold text-neutral-200">Session name – year</span> on {albumCreateIntegration}.
					</p>

					<div class="flex flex-col gap-3">
						<button
							class="w-full rounded-2xl bg-neutral-100 py-4 text-sm font-black tracking-tight text-neutral-950 transition-all hover:scale-[1.02] hover:bg-white"
							type="submit"
						>
							CREATE ALBUM
						</button>
						<button type="button" onclick={closeAlbumModal} class="w-full py-2 text-sm font-bold text-neutral-600 transition-colors hover:text-neutral-400"> Nevermind </button>
					</div>
				</form>
			{/if}
		</div>
	</Modal>
{/if}

{#if albumDeleteId}
	<Modal onClose={() => (albumDeleteId = undefined)} class="shadow-3xl !max-w-md !rounded-[2.5rem] !border-neutral-800 !bg-neutral-950">
		<div class="p-10">
			<h1 class="mb-2 text-3xl leading-none font-black tracking-tighter text-neutral-100 uppercase italic">
				Remove <span class="font-light text-neutral-500 not-italic">Link</span>
			</h1>
			<p class="mb-10 leading-relaxed font-medium text-neutral-400">This will only remove the link from the database. The album will remain on the external service.</p>

			<form
				method="POST"
				action="?/delete-album"
				use:enhance={() => {
					return async ({ result, update }) => {
						if (result.type === 'success') {
							app.addToast('Link removed successfully!', 'success');
							albumDeleteId = undefined;
						} else if (result.type === 'error') {
							app.addToast(`Failed to remove link`, 'error');
						} else if (result.type === 'redirect') {
							update();
						} else if (result.type === 'failure') {
							app.addToast(`Failed to remove link: ${result.data?.error}`, 'error');
						}
						invalidateAll();
					};
				}}
				class="flex flex-col gap-3"
			>
				<input type="hidden" name="id" value={albumDeleteId} required />

				<button class="w-full rounded-2xl bg-neutral-700 py-4 text-sm font-black tracking-tight text-white transition-all hover:scale-[1.02] hover:bg-neutral-500" type="submit">
					REMOVE LINK
				</button>
				<button type="button" onclick={() => (albumDeleteId = undefined)} class="w-full py-2 text-sm font-bold text-neutral-600 transition-colors hover:text-neutral-400">
					Cancel
				</button>
			</form>
		</div>
	</Modal>
{/if}

<style>
	/* Touch devices have no hover, so the unlink control stays visible there
	   and only reveals itself on pointer devices. It stays focusable so the
	   keyboard can reach it either way. */
	@media (hover: hover) {
		.album-unlink {
			opacity: 0;
			pointer-events: none;
			transition: opacity 120ms ease;
		}

		.album:hover .album-unlink,
		.album-unlink:focus-visible {
			opacity: 1;
			pointer-events: auto;
		}
	}
</style>
