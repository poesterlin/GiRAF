<script lang="ts">
	import { onDestroy, untrack, type Snippet } from 'svelte';
	import { goto, invalidateAll } from '$app/navigation';
	import Tooltip from '$lib/ui/Tooltip.svelte';
	import { IconAdjustmentsFilled, IconArchive, IconCheck, IconChevronLeft, IconLayoutGrid, IconTransferIn, IconDeviceFloppy } from '$lib/ui/icons';
	import IconDots from '@tabler/icons-svelte/icons/dots';
	import IconArrowsSort from '@tabler/icons-svelte/icons/arrows-sort';
	import type { SessionSort, SessionsResponse } from '../../routes/api/sessions/+server';
	import { app } from '$lib/state/app.svelte';
	import ConfirmModal from './ConfirmModal.svelte';
	import Modal from './Modal.svelte';

	type Session = SessionsResponse['sessions'][number];
	interface Props {
		sessions: SessionsResponse['sessions'];
		next: number | null;
		onLoaded: (data: SessionsResponse) => void;
		basePath?: 'editor' | 'triage';
		triageEnabled?: boolean;
		activeSessionId?: number;
		sort?: SessionSort;
		allowRename?: boolean;
		editedThumbnails?: boolean;
		header?: Snippet;
	}

	type ImportJobStatus = 'idle' | 'running' | 'success' | 'error' | 'cancelled';
	type ImportJobState = {
		status: ImportJobStatus;
		message?: string;
	};

	let {
		sessions,
		next,
		onLoaded,
		basePath = 'editor',
		triageEnabled = true,
		activeSessionId,
		sort = 'upload',
		allowRename = false,
		editedThumbnails = false,
		header
	}: Props = $props();
	let renaming = $state<Session | null>(null);
	let renameValue = $state('');
	let savingName = $state(false);
	let openMenuSessionId = $state<number | null>(null);
	let showSortMenu = $state(false);
	let brokenCovers = $state<Set<number>>(new Set());
	let scroller = $state<HTMLDivElement>();
	let sentinel = $state<HTMLDivElement>();

	const sortOptions: { value: SessionSort; label: string; href: string }[] = [
		{ value: 'upload', label: 'Last upload', href: '/gallery?sort=upload' },
		{ value: 'recorded', label: 'Recording date', href: '/gallery?sort=recorded' },
		{ value: 'edit', label: 'Last edit', href: '/gallery?sort=edit' }
	];
	let currentSortLabel = $derived(sortOptions.find((option) => option.value === sort)?.label ?? 'Last upload');

	function covers(session: Session) {
		return session.images.filter((img) => !img.isArchived && !brokenCovers.has(img.id)).slice(0, 4);
	}

	function previewSrc(img: Session['images'][number]) {
		return editedThumbnails && img.snapshotId
			? `/api/images/${img.id}/edited-thumbnail?snapshot=${img.snapshotId}&version=${img.version}`
			: `/api/images/${img.id}/preview?version=${img.version}&size=400`;
	}

	$effect(() => {
		void sessions.length;
		if (activeSessionId || !scroller || !sentinel) return;
		const observer = new IntersectionObserver(
			(entries) => {
				if (entries.some((entry) => entry.isIntersecting)) void loadMore();
			},
			{ root: scroller, rootMargin: '0px 0px 800px 0px' }
		);
		observer.observe(sentinel);
		return () => observer.disconnect();
	});

	async function loadMore() {
		if (loading || !next) return;
		loading = true;
		try {
			const response = await fetch(`/api/sessions?cursor=${next}${sort !== 'upload' ? `&sort=${sort}` : ''}`);
			const result = (await response.json()) as SessionsResponse;
			onLoaded(result);
		} finally {
			loading = false;
		}
	}
	$effect(() => {
		const exporting = sessions.filter((session) => session.isExporting).map((session) => session.id);
		if (!allowRename || !exporting.length) return;
		let active = true;
		let checking = false;
		const interval = setInterval(async () => {
			if (checking) return;
			checking = true;
			try {
				await Promise.all(
					exporting.map(async (id) => {
						const response = await fetch(`/api/sessions/${id}/export`);
						if (!response.ok) return;
						const state = await response.json();
						if (active && state.status !== 'running') sessions = sessions.map((session) => (session.id === id ? { ...session, isExporting: false } : session));
					})
				);
			} catch (cause) {
				console.error('Failed to check export status', cause);
			} finally {
				checking = false;
			}
		}, 2000);
		return () => {
			active = false;
			clearInterval(interval);
		};
	});
	async function saveName(event: SubmitEvent) {
		event.preventDefault();
		if (!renaming || savingName || !renameValue.trim() || sessions.some((session) => session.id === renaming?.id && session.isExporting)) return;
		savingName = true;
		try {
			const response = await fetch(`/api/sessions/${renaming.id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name: renameValue.trim() })
			});
			if (!response.ok) {
				const result = await response.json();
				throw new Error(result.message ?? 'Failed to rename session.');
			}
			const result = await response.json();
			sessions = sessions.map((session) => (session.id === result.id ? { ...session, name: result.name } : session));
			renaming = null;
			await invalidateAll();
		} catch (cause) {
			app.addToast(cause instanceof Error ? cause.message : 'Failed to rename session.', 'error');
		} finally {
			savingName = false;
		}
	}

	let initialImports = $derived(sessions.filter((s) => s.isImporting).map((s) => s.id));

	let loading = $state(false);
	let importJobStates = $state<Set<number>>(new Set());
	let pollingIntervals: Record<number, ReturnType<typeof setInterval>> = {};

	$effect(() => {
		const pending = initialImports;
		// Seeding the state here would re-trigger this effect forever, and
		// restarting the interval on every refresh would stop it ticking.
		untrack(() => {
			for (const sessionId of pending) {
				if (importJobStates.has(sessionId)) continue;
				importJobStates = new Set([...importJobStates, sessionId]);
				startImportPolling(sessionId, false);
			}
		});
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
		importJobStates = new Set([...importJobStates].filter((id) => id !== sessionId));
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
					app.addToast(state.message ?? 'Import completed successfully.', 'success');
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
		importJobStates = new Set([...importJobStates, sessionId]);
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

	let archiveTarget = $state<number | null>(null);

	async function archiveSession(sessionId: number) {
		archiveTarget = null;
		try {
			const res = await fetch(`/api/sessions/${sessionId}/archive`, { method: 'POST' });
			if (res.ok) {
				sessions = sessions.filter((s) => s.id !== sessionId);
				if (activeSessionId === sessionId) {
					await goto('/gallery', { invalidateAll: true });
				} else {
					await invalidateAll();
				}
				return;
			}
		} catch (error) {
			console.error('Failed to archive session', error);
		}
		app.addToast('Failed to archive session.', 'error');
	}

	async function downloadRaw(session: Session) {
		const res = await fetch(`/api/sessions/${session.id}/download-raw`);
		if (!res.ok) {
			app.addToast('Failed to download raw files', 'error');
			return;
		}
		const blob = await res.blob();
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `${session.name}-raw.zip`;
		document.body.appendChild(a);
		a.click();
		a.remove();
		URL.revokeObjectURL(url);
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

<svelte:window
	onpointerdown={(event) => {
		if (!(event.target as Element)?.closest('.card-menu')) openMenuSessionId = null;
		if (!(event.target as Element)?.closest('.sort-menu')) showSortMenu = false;
	}}
	onkeydown={(event) => {
		if (event.key === 'Escape') {
			openMenuSessionId = null;
			showSortMenu = false;
		}
	}}
/>

{#snippet sessionActions(item: Session)}
	<div class="flex shrink-0 items-center gap-1 rounded-full border border-neutral-800 bg-neutral-900/50 p-1">
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
					type="button"
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
				type="button"
				onclick={() => (archiveTarget = item.id)}
				aria-label="Archive Session"
				class="flex h-8 w-8 items-center justify-center rounded-full text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-neutral-100"
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
				type="button"
				aria-label="Download Raw Files"
				class="flex h-8 w-8 items-center justify-center rounded-full text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-neutral-100"
				onclick={() => downloadRaw(item)}
			>
				<IconDeviceFloppy size={18} />
			</button>
		</Tooltip>
	</div>
{/snippet}

{#snippet detailView(item: Session)}
	<section class="mx-4 mb-12">
		<div class="sticky top-0 z-10 flex items-center justify-between bg-neutral-950/90 py-5 backdrop-blur-md">
			<div class="flex w-full items-center justify-between gap-3 px-3 sm:w-auto sm:justify-start sm:gap-6 sm:pr-0">
				<div class="flex min-w-0 items-center gap-2.5 sm:gap-3.5">
					<a
						href="/gallery"
						class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-neutral-800 bg-neutral-900/60 text-neutral-300 transition-colors hover:bg-neutral-800 hover:text-white"
						aria-label="Back to sessions"
						title="All sessions"
					>
						<IconChevronLeft size={20} />
					</a>
					<div class="flex min-w-0 flex-col">
						<div class="flex min-w-0 items-center gap-2">
							<h2 class="truncate text-2xl font-bold tracking-tight text-neutral-100">{item.name}</h2>
							{#if allowRename}
								<button
									type="button"
									disabled={item.isExporting}
									title={item.isExporting ? 'Wait for the export to finish' : 'Rename session'}
									class="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg text-neutral-400 hover:bg-neutral-800 hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
									aria-label={`Rename ${item.name}`}
									onclick={() => {
										renaming = item;
										renameValue = item.name;
									}}
								>
									<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"
										><path d="m16 3 5 5-12 12H4v-5Z" /><path d="m14 5 5 5" /></svg
									>
								</button>
							{/if}
						</div>
						<p class="text-xs font-medium tracking-widest text-neutral-500 uppercase">{formatDate(item.startedAt)} • {item.imageCount} images</p>
					</div>
				</div>

				{@render sessionActions(item)}
			</div>
		</div>

		<div class="grid grid-cols-2 gap-4 px-3 sm:grid-cols-3 sm:gap-6 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
			{#each item.images.filter((img) => !img.isArchived) as preview (preview.id)}
				<a
					href={`/${basePath}/${preview.id}`}
					class="group relative block aspect-[3/2] overflow-hidden rounded-xl bg-neutral-900 shadow-lg ring-1 ring-neutral-800 transition-all hover:shadow-2xl hover:ring-neutral-600"
				>
					<img src={previewSrc(preview)} alt="" loading="lazy" decoding="async" class="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110" />

					<div class="absolute inset-0 bg-linear-to-t from-neutral-950/60 to-transparent opacity-0 transition-opacity group-hover:opacity-100"></div>

					{#if preview.hasSnapshot}
						<div class="absolute top-3 right-3 flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-neutral-950/60 text-neutral-100 backdrop-blur-md">
							<IconAdjustmentsFilled size={14} />
						</div>
					{/if}
				</a>
			{:else}
				<div class="flex aspect-[3/2] items-center justify-center rounded-xl border-2 border-dashed border-neutral-800 bg-neutral-900/30 text-neutral-600">
					<span class="text-xs font-bold tracking-widest uppercase">No Images</span>
				</div>
			{/each}
		</div>
	</section>
{/snippet}

{#snippet sessionCard(item: Session)}
	{@const cover = covers(item)}
	<li class="card">
		<a href={`/gallery?session=${item.id}`} class="mosaic" class:single={cover.length < 2} aria-label={`Open ${item.name}`}>
			{#each cover as photo (photo.id)}
				<img src={previewSrc(photo)} alt="" loading="lazy" decoding="async" draggable="false" onerror={() => (brokenCovers = new Set([...brokenCovers, photo.id]))} />
			{:else}
				<span class="empty-cover"><IconLayoutGrid size={28} /></span>
			{/each}
		</a>
		<div class="flex items-center justify-between gap-2 p-3 pl-4">
			<div class="min-w-0">
				<a href={`/gallery?session=${item.id}`} class="block truncate text-sm font-semibold text-neutral-100 hover:underline">{item.name}</a>
				<p class="text-xs text-neutral-500">{formatDate(item.startedAt)} · {item.imageCount} photo{item.imageCount === 1 ? '' : 's'}</p>
			</div>
			<div class="card-menu relative shrink-0">
				{#if importJobStates.has(item.id)}
					<div class="flex items-center gap-2 rounded-full border border-neutral-800 bg-neutral-900/50 px-3 py-1.5 text-xs font-bold text-neutral-400">
						<span class="flex h-2 w-2">
							<span class="absolute inline-flex h-2 w-2 animate-ping rounded-full bg-neutral-400 opacity-75"></span>
							<span class="relative inline-flex h-2 w-2 rounded-full bg-neutral-500"></span>
						</span>
						Processing
					</div>
				{:else}
					<button
						type="button"
						class="menu-trigger"
						aria-label={`Actions for ${item.name}`}
						aria-expanded={openMenuSessionId === item.id}
						aria-controls={`session-menu-${item.id}`}
						onclick={() => (openMenuSessionId = openMenuSessionId === item.id ? null : item.id)}
					>
						<IconDots size={18} />
					</button>
					{#if openMenuSessionId === item.id}
						<div id={`session-menu-${item.id}`} class="menu-popover" role="group" aria-label={`Actions for ${item.name}`}>
							{#if allowRename}
								<button
									type="button"
									disabled={item.isExporting}
									title={item.isExporting ? 'Wait for the export to finish' : undefined}
									onclick={() => {
										openMenuSessionId = null;
										renaming = item;
										renameValue = item.name;
									}}
								>
									<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"
										><path d="m16 3 5 5-12 12H4v-5Z" /><path d="m14 5 5 5" /></svg
									>
									Rename session
								</button>
							{/if}
							{#if triageEnabled && basePath !== 'triage' && item.images.length > 0}
								<a href={`/triage/${item.images[0].id}`} onclick={() => (openMenuSessionId = null)}>
									<IconLayoutGrid size={16} />
									Triage session
								</a>
							{/if}
							<button
								type="button"
								onclick={() => {
									openMenuSessionId = null;
									void importSession(item.id);
								}}
							>
								<IconTransferIn size={16} />
								Reprocess images
							</button>
							<button
								type="button"
								onclick={() => {
									openMenuSessionId = null;
									void downloadRaw(item);
								}}
							>
								<IconDeviceFloppy size={16} />
								Download RAW files
							</button>
							<button
								type="button"
								onclick={() => {
									openMenuSessionId = null;
									archiveTarget = item.id;
								}}
							>
								<IconArchive size={16} />
								Archive session
							</button>
						</div>
					{/if}
				{/if}
			</div>
		</div>
	</li>
{/snippet}

{#if renaming}
	<Modal
		onClose={() => {
			if (!savingName) renaming = null;
		}}
	>
		<form onsubmit={saveName} class="space-y-5 p-6 sm:p-8">
			<h2 class="pr-8 text-xl font-semibold text-neutral-100">Rename session</h2>
			<label class="flex flex-col gap-2 text-sm text-neutral-300"
				>Session name
				<input required bind:value={renameValue} disabled={savingName} class="min-h-12 rounded-xl border border-neutral-600 bg-neutral-900 px-3 text-neutral-100" />
			</label>
			<div class="flex justify-end gap-3">
				<button type="button" disabled={savingName} class="min-h-12 rounded-xl border border-neutral-600 px-5" onclick={() => (renaming = null)}>Cancel</button>
				<button
					type="submit"
					disabled={savingName || !renameValue.trim() || sessions.some((session) => session.id === renaming?.id && session.isExporting)}
					class="min-h-12 rounded-xl bg-neutral-100 px-5 font-semibold text-neutral-950 disabled:opacity-40">{savingName ? 'Saving…' : 'Save'}</button
				>
			</div>
		</form>
	</Modal>
{/if}

{#snippet empty()}
	<div class="flex h-full flex-col items-center justify-center p-12 text-center">
		<div class="mb-8 flex h-24 w-24 items-center justify-center rounded-3xl bg-neutral-900 text-neutral-700 shadow-inner ring-1 ring-neutral-800">
			<IconLayoutGrid size={48} />
		</div>
		<h2 class="mb-2 text-2xl font-bold tracking-tight text-neutral-100">Your Gallery is Empty</h2>
		<p class="max-w-md text-sm leading-relaxed text-neutral-500">It looks like you haven't created any sessions yet. Start a new editing session to see your photos here.</p>
	</div>
{/snippet}

<div bind:this={scroller} class="h-full w-full overflow-y-auto">
	{#if header}
		{@render header()}
	{/if}
	{#if activeSessionId}
		{#if sessions[0]}
			{@render detailView(sessions[0])}
		{:else}
			<div class="flex flex-col items-center justify-center gap-4 py-16 text-center">
				<p class="text-sm text-neutral-500">Session not found.</p>
				<a href="/gallery" class="rounded-xl bg-neutral-800 px-4 py-2 text-sm font-medium text-neutral-200 hover:bg-neutral-700">Back to sessions</a>
			</div>
		{/if}
	{:else if sessions.length}
		<div class="flex items-center justify-between px-4 pt-5 pb-3 sm:px-7">
			<h2 class="text-sm font-semibold text-neutral-200">Sessions</h2>
			<div class="sort-menu relative">
				<button
					type="button"
					class="flex min-h-9 items-center gap-1.5 rounded-lg border border-neutral-800 bg-neutral-900/60 px-3 text-xs font-medium text-neutral-300 transition-colors hover:border-neutral-700 hover:bg-neutral-800 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
					aria-label={`Sort sessions, currently ${currentSortLabel}`}
					aria-expanded={showSortMenu}
					aria-controls="session-sort-menu"
					onclick={() => (showSortMenu = !showSortMenu)}
				>
					<IconArrowsSort size={15} />
					<span>{currentSortLabel}</span>
				</button>
				{#if showSortMenu}
					<div id="session-sort-menu" class="sort-popover" role="group" aria-label="Sort sessions by">
						{#each sortOptions as option (option.value)}
							<a href={option.href} aria-current={sort === option.value ? 'true' : undefined} data-sveltekit-noscroll onclick={() => (showSortMenu = false)}>
								<span>{option.label}</span>
								{#if sort === option.value}
									<IconCheck size={15} />
								{/if}
							</a>
						{/each}
					</div>
				{/if}
			</div>
		</div>
		<ul class="grid grid-cols-1 gap-6 px-4 pb-12 sm:grid-cols-2 sm:px-7 lg:grid-cols-3 xl:grid-cols-4">
			{#each sessions as session (session.id)}
				{@render sessionCard(session)}
			{/each}
		</ul>
		<div bind:this={sentinel} aria-hidden="true"></div>
		{#if loading}
			<div class="flex justify-center p-4 pb-12">
				<p class="text-neutral-400">Loading more...</p>
			</div>
		{/if}
	{:else}
		{@render empty()}
	{/if}
</div>

{#if archiveTarget !== null}
	<ConfirmModal
		title="Archive session?"
		message="It moves to Archived sessions in the gallery, where you can restore it."
		confirmLabel="Archive"
		onConfirm={() => archiveSession(archiveTarget!)}
		onCancel={() => (archiveTarget = null)}
	/>
{/if}

<style>
	.card {
		position: relative;
		border-radius: 12px;
		background: #141414;
		outline: 1px solid #262626;
	}
	.mosaic {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 2px;
		aspect-ratio: 3 / 2;
		overflow: hidden;
		border-radius: 12px 12px 0 0;
		background: #0a0a0a;
	}
	.mosaic.single {
		grid-template-columns: 1fr;
	}
	.mosaic img {
		width: 100%;
		height: 100%;
		min-height: 0;
		object-fit: cover;
		opacity: 0.85;
		transition: opacity 150ms;
	}
	/* Three photos: the first spans the top row so the mosaic has no gap. */
	.mosaic img:first-child:nth-last-child(3) {
		grid-column: span 2;
	}
	.mosaic:hover img {
		opacity: 1;
	}
	.mosaic:focus-visible {
		outline: 2px solid #fff;
		outline-offset: -2px;
	}
	.empty-cover {
		display: flex;
		grid-column: 1 / -1;
		align-items: center;
		justify-content: center;
		color: #525252;
	}
	.menu-trigger {
		display: flex;
		min-height: 40px;
		min-width: 40px;
		align-items: center;
		justify-content: center;
		border-radius: 8px;
		color: #a3a3a3;
		transition:
			background-color 120ms,
			color 120ms;
	}
	.menu-trigger:hover {
		background: #262626;
		color: #f5f5f5;
	}
	.menu-trigger[aria-expanded='true'] {
		background: #f5f5f5;
		color: #0a0a0a;
	}
	.menu-trigger:focus-visible {
		outline: 2px solid #fff;
		outline-offset: 2px;
	}
	.menu-popover {
		position: absolute;
		right: 0;
		bottom: calc(100% + 6px);
		z-index: 30;
		width: 196px;
		padding: 4px;
		border-radius: 10px;
		border: 1px solid #404040;
		background: #171717;
		box-shadow: 0 12px 32px #000c;
	}
	.menu-popover button,
	.menu-popover a {
		display: flex;
		width: 100%;
		min-height: 40px;
		align-items: center;
		gap: 10px;
		padding: 0 12px;
		border-radius: 6px;
		color: #e5e5e5;
		font-size: 13px;
		font-weight: 500;
		text-align: left;
		white-space: nowrap;
		transition: background-color 100ms;
	}
	.menu-popover button:hover:not(:disabled),
	.menu-popover a:hover {
		background: #2a2a2a;
		color: #fff;
	}
	.menu-popover button:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}
	.menu-popover button:focus-visible,
	.menu-popover a:focus-visible {
		outline: 2px solid #fff;
		outline-offset: -2px;
	}
	.sort-popover {
		position: absolute;
		right: 0;
		top: calc(100% + 6px);
		z-index: 30;
		width: 168px;
		padding: 4px;
		border-radius: 10px;
		border: 1px solid #404040;
		background: #171717;
		box-shadow: 0 12px 32px #000c;
	}
	.sort-popover a {
		display: flex;
		width: 100%;
		min-height: 38px;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		padding: 0 12px;
		border-radius: 6px;
		color: #a3a3a3;
		font-size: 13px;
		font-weight: 500;
		white-space: nowrap;
		transition:
			background-color 100ms,
			color 100ms;
	}
	.sort-popover a:hover {
		background: #2a2a2a;
		color: #fff;
	}
	.sort-popover a[aria-current='true'] {
		color: #f5f5f5;
		font-weight: 600;
	}
	.sort-popover a:focus-visible {
		outline: 2px solid #fff;
		outline-offset: -2px;
	}
</style>
