<script lang="ts">
	import { onDestroy } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import Scroller from '$lib/ui/Scroller.svelte';
	import Tooltip from '$lib/ui/Tooltip.svelte';
	import { IconAdjustmentsFilled, IconArchive, IconLayoutGrid, IconTransferIn, IconDeviceFloppy } from '$lib/ui/icons';
	import type { SessionsResponse } from '../../routes/api/sessions/+server';
	import { app } from '$lib/state/app.svelte';

	type Session = SessionsResponse['sessions'][number];
	interface Props {
		sessions: SessionsResponse['sessions'];
		next: number | null;
		onLoaded: (data: SessionsResponse) => void;
		basePath?: 'editor' | 'triage';
		triageEnabled?: boolean;
	}

	type ImportJobStatus = 'idle' | 'running' | 'success' | 'error' | 'cancelled';
	type ImportJobState = {
		status: ImportJobStatus;
		message?: string;
	};

	let { sessions, next, onLoaded, basePath = 'editor', triageEnabled = true }: Props = $props();

	let initialImports = $derived(sessions.filter((s) => s.isImporting).map((s) => s.id));

	let scroller = $state<Scroller<Session>>();
	let loading = $state(false);
	let importJobStates = $state<Set<number>>(new Set());
	let pollingIntervals: Record<number, ReturnType<typeof setInterval>> = {};

	$effect(() => {
		for (const sessionId of initialImports) {
			importJobStates.add(sessionId);
			importJobStates = new Set(importJobStates);
			startImportPolling(sessionId, false);
		}
	});

	onDestroy(() => {
		for (const sessionId of Object.keys(pollingIntervals)) {
			stopImportPolling(Number(sessionId));
		}
	});

	function stopImportPolling(sessionId: number) {
		const intervalId = pollingIntervals[sessionId];
		if (!intervalId) return;
		clearInterval(intervalId);
		delete pollingIntervals[sessionId];
	}

	function clearImportState(sessionId: number) {
		importJobStates.delete(sessionId);
		importJobStates = new Set(importJobStates);
	}

	function startImportPolling(sessionId: number, notifyOnCompletion: boolean) {
		stopImportPolling(sessionId);
		pollingIntervals[sessionId] = setInterval(async () => {
			try {
				const statusResponse = await fetch(`/api/sessions/${sessionId}/import`);
				if (!statusResponse.ok) {
					throw new Error('Failed to fetch import status');
				}

				const state = (await statusResponse.json()) as ImportJobState;
				if (state.status === 'running') {
					return;
				}

				stopImportPolling(sessionId);
				clearImportState(sessionId);
				await invalidateAll();

				if (!notifyOnCompletion) {
					return;
				}

				if (state.status === 'success') {
					app.addToast('Import completed successfully.', 'success');
				} else if (state.status === 'cancelled') {
					app.addToast('Import was cancelled.', 'info');
				} else if (state.status === 'error') {
					app.addToast(state.message ? `Import failed: ${state.message}` : 'Import failed.', 'error');
				}
			} catch (error) {
				console.error('Failed to fetch import job status', error);
				stopImportPolling(sessionId);
				clearImportState(sessionId);
				app.addToast('Failed to check import status.', 'error');
			}
		}, 2000);
	}

	async function importSession(sessionId: number) {
		importJobStates.add(sessionId);
		importJobStates = new Set(importJobStates);
		const response = await fetch(`/api/sessions/${sessionId}/import`, { method: 'POST' });

		if (!response.ok && response.status !== 409) {
			console.error('Failed to start import job', await response.text());
			clearImportState(sessionId);
			app.addToast('Failed to start import job.', 'error');
			return;
		}

		app.addToast(response.status === 409 ? 'Import is already running.' : 'Import started.', 'info');
		startImportPolling(sessionId, true);
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
	<section class="mx-4 mb-12">
		<div class="sticky top-0 z-10 flex items-center justify-between bg-neutral-950/90 py-6 backdrop-blur-md">
			<div class="flex items-center gap-6 pl-3">
				<div class="flex flex-col">
					<h2 class="text-2xl font-bold tracking-tight text-neutral-100">{item.name}</h2>
					<p class="text-xs font-medium tracking-widest uppercase text-neutral-500">{formatDate(item.startedAt)} • {item.imageCount} images</p>
				</div>
				
				<div class="flex items-center gap-1 rounded-full border border-neutral-800 bg-neutral-900/50 p-1">
					{#if importJobStates.has(item.id)}
						<div class="flex items-center gap-2 rounded-full px-3 py-1 text-xs font-bold text-neutral-400">
							<span class="flex h-2 w-2">
								<span class="absolute inline-flex h-2 w-2 animate-ping rounded-full bg-neutral-400 opacity-75"></span>
								<span class="relative inline-flex h-2 w-2 rounded-full bg-neutral-500"></span>
							</span>
							Processing
						</div>
					{:else}
						<Tooltip text="Process Session Images" position="top">
							<button
								aria-label="Reprocess Session Images"
								onclick={() => importSession(item.id)}
								class="flex h-8 w-8 items-center justify-center rounded-full text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-neutral-100"
							>
								<IconTransferIn size={18}></IconTransferIn>
							</button>
						</Tooltip>
					{/if}
					
					<Tooltip text="Archive Session" position="top">
						<button 
							onclick={() => archiveSession(item.id)} 
							aria-label="Archive Session" 
							class="flex h-8 w-8 items-center justify-center rounded-full text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-red-400"
						>
							<IconArchive size={18}></IconArchive>
						</button>
					</Tooltip>

					{#if triageEnabled && basePath !== 'triage' && item.images.length > 0}
						<Tooltip text="Triage Session" position="top">
							<a 
								href={`/triage/${item.images[0].id}`} 
								aria-label="Triage Session" 
								class="flex h-8 w-8 items-center justify-center rounded-full text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-neutral-100"
							>
								<IconLayoutGrid size={18} />
							</a>
						</Tooltip>
					{/if}

					<Tooltip text="Download Raw Files" position="top">
						<button
							aria-label="Download Raw Files"
							class="flex h-8 w-8 items-center justify-center rounded-full text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-neutral-100"
							onclick={async () => {
								const res = await fetch(`/api/sessions/${item.id}/download-raw`);
								if (!res.ok) {
									app.addToast('Failed to download raw files', 'error');
									return;
								}

								const blob = await res.blob();
								const url = URL.createObjectURL(blob);
								const a = document.createElement('a');
								a.href = url;
								a.download = `${item.name}-raw.zip`;
								document.body.appendChild(a);
								a.click();
								a.remove();
								URL.revokeObjectURL(url);
							}}
						>
							<IconDeviceFloppy size={18} />
						</button>
					</Tooltip>
				</div>
			</div>
		</div>

		<div class="grid grid-cols-2 px-3 gap-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
			{#each item.images.filter((img) => !img.isArchived) as preview}
				<a
					href={`/${basePath}/${preview.id}`}
					class="group relative block aspect-[3/2] overflow-hidden rounded-xl bg-neutral-900 shadow-lg ring-1 ring-neutral-800 transition-all hover:shadow-2xl hover:ring-neutral-600"
				>
					<img
						src="/api/images/{preview.id}/preview?version={preview.version}"
						alt=""
						loading="lazy"
						class="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
					/>
					
					<div class="absolute inset-0 bg-linear-to-t from-neutral-950/60 to-transparent opacity-0 transition-opacity group-hover:opacity-100"></div>

					{#if preview.hasSnapshot}
						<div class="absolute top-3 right-3 flex h-7 w-7 items-center justify-center rounded-full bg-neutral-950/60 text-neutral-100 backdrop-blur-md border border-white/10">
							<IconAdjustmentsFilled size={14} />
						</div>
					{/if}
				</a>
			{:else}
				<div class="flex aspect-[3/2] items-center justify-center rounded-xl border-2 border-dashed border-neutral-800 bg-neutral-900/30 text-neutral-600">
					<span class="text-xs font-bold uppercase tracking-widest">No Images</span>
				</div>
			{/each}
		</div>
	</section>
{/snippet}

{#snippet empty()}
	<div class="flex h-full flex-col items-center justify-center p-12 text-center">
		<div class="mb-8 flex h-24 w-24 items-center justify-center rounded-3xl bg-neutral-900 text-neutral-700 shadow-inner ring-1 ring-neutral-800">
			<IconLayoutGrid size={48} />
		</div>
		<h2 class="mb-2 text-2xl font-bold tracking-tight text-neutral-100">Your Gallery is Empty</h2>
		<p class="max-w-md text-sm text-neutral-500 leading-relaxed">It looks like you haven't created any sessions yet. Start a new editing session to see your photos here.</p>
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

