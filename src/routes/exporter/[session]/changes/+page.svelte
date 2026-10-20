<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { app } from '$lib/state/app.svelte';
	import ConfirmModal from '$lib/ui/ConfirmModal.svelte';
	import { IconArrowBackUp, IconCheck, IconChevronLeft, IconChevronRight, IconRestore } from '$lib/ui/icons';
	import IconFileExport from '@tabler/icons-svelte/icons/file-export';
	import { onDestroy, onMount, untrack } from 'svelte';

	let { data } = $props();

	type Change = (typeof data.changes)[number];
	type Archived = (typeof data.archived)[number];
	type ExportJobState = {
		status: 'idle' | 'running' | 'cancelling' | 'success' | 'error' | 'cancelled';
		message?: string;
	};

	let job = $state<ExportJobState>(untrack(() => data.exportJob));
	let starting = $state(false);
	let pendingRevert = $state<Change | null>(null);
	let reverting = $state(false);
	let restoringId = $state<number | null>(null);
	let poll: ReturnType<typeof setInterval> | undefined;

	const busy = $derived(job.status === 'running' || job.status === 'cancelling');
	const pendingCount = $derived(data.changes.length);

	const sections = $derived([
		{
			key: 'added',
			title: data.hasPriorExport ? 'Added' : 'Not exported yet',
			short: data.hasPriorExport ? 'Added' : 'Not exported',
			description: data.hasPriorExport ? 'New photos added to the session since the last export.' : 'Photos waiting for the first export of this session.',
			dot: 'bg-emerald-400',
			changes: data.changes.filter((change) => change.kind === 'added')
		},
		{
			key: 'edited',
			title: 'Edited',
			short: 'Edited',
			description: 'Photos with edits saved since the last export.',
			dot: 'bg-neutral-300',
			changes: data.changes.filter((change) => change.kind === 'edited')
		},
		{
			key: 'missing',
			title: 'Missing export files',
			short: 'Missing',
			description: 'The export file is gone, so these photos will be rendered again.',
			dot: 'bg-amber-400',
			changes: data.changes.filter((change) => change.kind === 'missing')
		}
	]);

	const lastExportText = $derived(data.lastExportedAt ? `Last export ${formatDay(data.lastExportedAt)}` : 'Never exported');

	function formatDay(value: Date) {
		return new Date(value).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
	}

	function formatMoment(value: Date) {
		return new Date(value).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
	}

	function snapshotThumbnail(change: Change, snapshotId: number | null) {
		return snapshotId ? `/api/images/${change.imageId}/edited-thumbnail?snapshot=${snapshotId}&version=${change.version}` : `/api/images/${change.imageId}/preview?size=320`;
	}

	function beforeImage(change: Change) {
		if (change.kind === 'added' || !change.beforeSnapshotId) return null;
		return snapshotThumbnail(change, change.beforeSnapshotId);
	}

	function afterImage(change: Change) {
		if (change.kind === 'missing') return null;
		return snapshotThumbnail(change, change.snapshotId ?? change.beforeSnapshotId);
	}

	function beforeLabel(change: Change) {
		return change.kind === 'added' ? 'Not exported' : 'No saved version';
	}

	function archivedThumbnail(item: Archived) {
		return item.snapshotId ? `/api/images/${item.imageId}/edited-thumbnail?snapshot=${item.snapshotId}&version=${item.version}` : `/api/images/${item.imageId}/preview?size=320`;
	}

	async function restoreArchived(item: Archived) {
		if (restoringId !== null) return;
		restoringId = item.imageId;
		try {
			const response = await fetch(`/api/images/${item.imageId}/archive`, { method: 'DELETE' });
			if (!response.ok) throw new Error('Failed to restore photo.');
			app.addToast(`Restored ${item.name}.`, 'success');
			await invalidateAll();
		} catch (error) {
			console.error('[Changes] Restore failed', error);
			app.addToast('Failed to restore photo.', 'error');
		} finally {
			restoringId = null;
		}
	}

	function canRevert(change: Change) {
		return change.kind === 'edited' && change.beforeSnapshotId !== null;
	}

	function requestRevert(change: Change) {
		if (reverting) return;
		pendingRevert = change;
	}

	async function confirmRevert() {
		const change = pendingRevert;
		if (!change?.beforeSnapshotId || reverting) return;

		reverting = true;
		try {
			const response = await fetch(`/api/images/${change.imageId}/revert`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ snapshotId: change.beforeSnapshotId })
			});
			if (!response.ok) throw new Error('Failed to revert change.');

			const result = (await response.json()) as { revertedToExport: boolean };
			app.addToast(result.revertedToExport ? `Restored ${change.name} to its exported version.` : `Reverted ${change.name}.`, 'success');
			pendingRevert = null;
			await invalidateAll();
		} catch (error) {
			console.error('[Changes] Revert failed', error);
			app.addToast('Failed to revert change.', 'error');
		} finally {
			reverting = false;
		}
	}

	function changeDetail(change: Change) {
		if (change.kind === 'added') {
			return data.hasPriorExport ? `Added ${formatMoment(change.at)}` : `Imported ${formatMoment(change.at)}`;
		}
		if (change.kind === 'edited') {
			const edits = change.editCount === 1 ? '1 edit' : `${change.editCount} edits`;
			const detail = change.editCount > 0 ? `${edits} since last export · Last edited ${formatMoment(change.at)}` : `Edited ${formatMoment(change.at)}`;
			return change.fileMissing ? `${detail} · Export file missing` : detail;
		}
		return change.lastExportedAt ? `Last exported ${formatMoment(change.lastExportedAt)} · Export file is missing` : 'Export file is missing';
	}

	/** Desktop shows the time in the timeline gutter, so the detail leaves it out. */
	function shortDetail(change: Change) {
		if (change.kind === 'added') return data.hasPriorExport ? 'New photo in this session' : 'Waiting for its first export';
		if (change.kind === 'edited') {
			if (change.editCount === 0) return 'Edited since last export';
			return change.editCount === 1 ? '1 edit since last export' : `${change.editCount} edits since last export`;
		}
		return 'Export file is missing';
	}

	function timelineDate(change: Change) {
		return change.kind === 'missing' ? change.lastExportedAt : change.at;
	}

	function formatShortDay(value: Date) {
		return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
	}

	function formatTime(value: Date) {
		return new Date(value).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
	}

	function editCountLabel(count: number) {
		return count === 1 ? '1 saved edit stays in history.' : `${count} saved edits stay in history.`;
	}

	function stopPolling() {
		if (!poll) return;
		clearInterval(poll);
		poll = undefined;
	}

	function pollExport() {
		stopPolling();
		poll = setInterval(async () => {
			try {
				const response = await fetch(`/api/sessions/${data.session.id}/export`);
				if (!response.ok) throw new Error('Failed to check export status');

				const state = (await response.json()) as ExportJobState;
				if (state.status === 'running') return;

				stopPolling();
				job = state;

				if (state.status === 'success') {
					app.addToast('Export completed successfully.', 'success');
				} else if (state.status === 'cancelled') {
					app.addToast('Export was cancelled.', 'info');
				} else if (state.status === 'error') {
					app.addToast(state.message ? `Export failed: ${state.message}` : 'Export failed.', 'error');
				}
				await invalidateAll();
			} catch (error) {
				console.error('[Changes] Export status check failed', error);
				stopPolling();
				job = { status: 'error', message: 'Unable to check export status. Refresh to check again.' };
				app.addToast('Failed to check export status.', 'error');
			}
		}, 2000);
	}

	async function startExport() {
		starting = true;
		job = { status: 'running' };
		try {
			const response = await fetch(`/api/sessions/${data.session.id}/export`, { method: 'POST' });
			if (!response.ok && response.status !== 409) throw new Error('Failed to start export.');
			app.addToast(response.status === 409 ? 'Export is already running.' : 'Export started.', 'info');
			pollExport();
		} catch {
			job = { status: 'error', message: 'Failed to start export.' };
			app.addToast('Failed to start export.', 'error');
		} finally {
			starting = false;
		}
	}

	async function cancelExport() {
		job = { status: 'cancelling' };
		stopPolling();
		try {
			const response = await fetch(`/api/sessions/${data.session.id}/export`, { method: 'DELETE' });
			if (!response.ok) throw new Error('Failed to cancel export.');
			job = { status: 'cancelled' };
			app.addToast('Export cancellation requested.', 'info');
			await invalidateAll();
		} catch {
			job = { status: 'running' };
			pollExport();
			app.addToast('Failed to cancel export.', 'error');
		}
	}

	onMount(() => {
		if (job.status === 'running') pollExport();
	});

	onDestroy(stopPolling);
</script>

<svelte:head>
	<title>GiRAF | Changes: {data.session.name}</title>
</svelte:head>

{#snippet exportAction(wide: boolean)}
	{#if busy}
		<button
			onclick={cancelExport}
			disabled={job.status === 'cancelling'}
			class="rounded-2xl border border-neutral-700 bg-neutral-900 px-6 py-3 text-xs font-bold text-neutral-100 transition-colors hover:bg-neutral-800 disabled:cursor-not-allowed disabled:text-neutral-400 {wide
				? 'w-full'
				: ''}"
		>
			{job.status === 'cancelling' ? 'Cancelling…' : 'Cancel export'}
		</button>
	{:else if pendingCount > 0}
		<button
			onclick={startExport}
			disabled={starting}
			class="flex items-center justify-center gap-3 rounded-2xl bg-neutral-100 px-8 py-3 text-xs font-black tracking-tight text-neutral-950 uppercase transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-60 {wide
				? 'w-full'
				: ''}"
		>
			<IconFileExport size={14} />
			Export {pendingCount}
			{pendingCount === 1 ? 'photo' : 'photos'}
		</button>
	{/if}
{/snippet}

<div class="relative flex h-full flex-col bg-black">
	<div class="min-h-0 flex-1 overflow-y-auto px-4 pb-12 sm:px-6 lg:px-12">
		<div class="mx-auto w-full max-w-7xl">
			<header class="pt-5 pb-5 sm:pt-6 lg:pt-10 lg:pb-10">
				<a href="/exporter" class="inline-flex items-center gap-1 text-[11px] font-bold tracking-widest text-neutral-500 uppercase transition-colors hover:text-neutral-200">
					<IconChevronLeft size={14} />
					Exporter
				</a>

				<div class="mt-4 flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
					<div class="min-w-0">
						<h1 class="text-3xl font-black tracking-tighter text-neutral-100 uppercase italic sm:text-5xl">Changes</h1>
						<p class="mt-2 text-sm font-medium text-neutral-400 sm:text-base">
							<span class="text-neutral-200">{data.session.name}</span>
							<span aria-hidden="true" class="mx-2 text-neutral-700">·</span>
							{data.imageCount}
							{data.imageCount === 1 ? 'image' : 'images'}
							<span aria-hidden="true" class="mx-2 text-neutral-700">·</span>
							{lastExportText}
						</p>
					</div>
					<div class="flex shrink-0 items-center gap-3 lg:hidden">
						{@render exportAction(false)}
					</div>
				</div>

				{#if pendingCount > 0}
					<div class="mt-5 flex flex-wrap items-center gap-2 lg:hidden">
						<span
							class="inline-flex items-center gap-2 rounded-full border border-neutral-300/20 bg-neutral-500/10 px-3 py-1 text-[10px] font-black tracking-wider text-neutral-100 uppercase"
						>
							<span class="h-1.5 w-1.5 rounded-full bg-neutral-400"></span>
							{pendingCount}
							{pendingCount === 1 ? 'change pending' : 'changes pending'}
						</span>
						{#each sections as section (section.key)}
							{#if section.changes.length > 0}
								<span class="rounded-full border border-neutral-800 bg-neutral-900 px-3 py-1 text-[10px] font-bold tracking-wider text-neutral-400 uppercase">
									{section.changes.length}
									{section.short}
								</span>
							{/if}
						{/each}
						{#if data.archived.length > 0}
							<span class="rounded-full border border-neutral-800 bg-neutral-900 px-3 py-1 text-[10px] font-bold tracking-wider text-neutral-400 uppercase">
								{data.archived.length} archived
							</span>
						{/if}
					</div>
				{/if}
			</header>

			{#if pendingCount === 0 && data.archived.length === 0}
				<div class="flex flex-col items-center justify-center rounded-3xl border border-neutral-800 bg-neutral-900/20 px-6 py-20 text-center">
					<div class="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-neutral-900 text-emerald-400">
						<IconCheck size={30} />
					</div>
					<h2 class="text-xl font-black tracking-tighter text-neutral-100 uppercase italic sm:text-2xl">All caught up</h2>
					<p class="mt-2 max-w-sm text-sm font-medium text-neutral-500">Every photo in this session matches its last export.</p>
					<div class="mt-7 flex flex-wrap items-center justify-center gap-3">
						<a
							href="/exporter/{data.session.id}"
							class="rounded-2xl bg-neutral-100 px-6 py-3 text-xs font-black tracking-tight text-neutral-950 uppercase transition-colors hover:bg-white"
						>
							Preview exports
						</a>
						<a
							href="/exporter"
							class="rounded-2xl border border-neutral-800 bg-neutral-900/50 px-6 py-3 text-xs font-bold text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-neutral-100"
						>
							Back to Exporter
						</a>
					</div>
				</div>
			{:else}
				<div class="lg:grid lg:grid-cols-[minmax(0,1fr)_16rem] lg:items-start lg:gap-12 xl:grid-cols-[minmax(0,1fr)_18rem]">
					<div class="min-w-0">
						{#if pendingCount === 0}
							<div class="mb-2 flex items-center gap-3 rounded-2xl border border-neutral-800 bg-neutral-900/30 px-4 py-3 lg:mb-4">
								<IconCheck size={18} class="shrink-0 text-emerald-400" />
								<p class="text-sm font-medium text-neutral-400">All caught up. Every photo in this session matches its last export.</p>
							</div>
						{/if}
						{#each sections as section (section.key)}
							{#if section.changes.length > 0}
								<section id="changes-{section.key}" class="mt-8 scroll-mt-6 first:mt-1 lg:mt-12 lg:first:mt-0">
									<div class="mb-2 flex items-center gap-3 lg:mb-1">
										<span class="h-1.5 w-1.5 shrink-0 rounded-full {section.dot}" aria-hidden="true"></span>
										<h2 class="text-[11px] font-black tracking-[0.2em] text-neutral-300 uppercase">{section.title}</h2>
										<span class="rounded-full border border-neutral-800 bg-neutral-900 px-2 py-0.5 text-[10px] font-black text-neutral-400">{section.changes.length}</span>
										<span class="h-px flex-1 bg-neutral-800/80" aria-hidden="true"></span>
									</div>
									<p class="mb-3 text-xs font-medium text-neutral-600 lg:mb-6">{section.description}</p>

									<ol class="grid grid-cols-1 gap-3 lg:gap-0">
										{#each section.changes as change (change.imageId)}
											{@const before = beforeImage(change)}
											{@const after = afterImage(change)}
											{@const when = timelineDate(change)}
											<li class="relative lg:grid lg:grid-cols-[4.5rem_minmax(0,1fr)] lg:gap-8 lg:pb-8 lg:last:pb-0">
												<!-- Timeline gutter, desktop only -->
												<span class="absolute top-0 bottom-0 left-[5.5rem] hidden w-px -translate-x-1/2 bg-neutral-800 lg:block" aria-hidden="true"></span>
												<span class="absolute top-3.5 left-[5.5rem] hidden h-2 w-2 -translate-x-1/2 rounded-full ring-4 ring-black lg:block {section.dot}" aria-hidden="true"
												></span>
												<div class="hidden pt-2 text-right text-[11px] leading-tight font-medium tabular-nums lg:block">
													{#if when}
														<time datetime={new Date(when).toISOString()} class="block text-neutral-500">{formatShortDay(when)}</time>
														<span class="block text-neutral-600">{formatTime(when)}</span>
													{/if}
												</div>

												<article
													class="flex flex-col overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-900/30 transition-colors hover:border-neutral-700 lg:rounded-3xl lg:bg-neutral-900/40"
												>
													<a href="/editor/{change.imageId}" class="block p-1.5 focus-visible:outline-none lg:p-2" title="Open {change.name} in the editor">
														<div class="relative grid grid-cols-2 gap-1.5 lg:gap-2">
															{#each [{ label: 'Before', src: before, empty: beforeLabel(change) }, { label: 'After', src: after, empty: 'File missing' }] as side (side.label)}
																<figure class="relative overflow-hidden rounded-xl bg-neutral-900 lg:rounded-2xl">
																	{#if side.src}
																		<img src={side.src} alt="{change.name} {side.label.toLowerCase()}" loading="lazy" class="aspect-[3/2] h-full w-full object-cover" />
																	{:else}
																		<div
																			class="flex aspect-[3/2] w-full items-center justify-center px-2 text-center text-[10px] font-bold tracking-wider text-neutral-600 uppercase"
																		>
																			{side.empty}
																		</div>
																	{/if}
																	<figcaption
																		class="absolute top-2 left-2 rounded bg-black/70 px-2 py-1 text-[9px] font-black tracking-[0.15em] text-neutral-200 uppercase backdrop-blur"
																	>
																		{side.label}
																	</figcaption>
																</figure>
															{/each}
															<span
																class="pointer-events-none absolute top-1/2 left-1/2 hidden h-8 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-neutral-800 bg-black text-neutral-400 lg:flex"
																aria-hidden="true"
															>
																<IconChevronRight size={15} />
															</span>
														</div>
													</a>

													<div class="flex items-center justify-between gap-2 px-2.5 pt-1.5 pb-2 lg:px-5 lg:pt-2 lg:pb-4">
														<div class="min-w-0">
															<p class="text-xs leading-snug font-medium text-neutral-500 lg:hidden">{changeDetail(change)}</p>
															<p class="hidden text-sm font-bold text-neutral-200 lg:block">{shortDetail(change)}</p>
															{#if change.kind === 'edited' && change.fileMissing}
																<span
																	class="mt-1 inline-flex rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-[9px] font-black tracking-wider text-amber-200/90 uppercase"
																>
																	File missing
																</span>
															{/if}
														</div>
														<div class="flex shrink-0 items-center gap-1 lg:gap-2">
															{#if canRevert(change)}
																<button
																	type="button"
																	onclick={() => requestRevert(change)}
																	title="Restore the version from the last export"
																	class="flex shrink-0 items-center gap-1.5 rounded-lg border border-neutral-700 bg-neutral-900/70 px-2.5 py-1.5 text-[10px] font-black tracking-wider text-neutral-300 uppercase transition-colors hover:border-neutral-500 hover:bg-neutral-800 hover:text-neutral-100 lg:rounded-xl lg:px-3.5 lg:py-2"
																>
																	<IconRestore size={13} />
																	Revert
																</button>
															{/if}
															<a
																href="/editor/{change.imageId}"
																aria-label="Open {change.name} in the editor"
																title="Open in editor"
																class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-neutral-600 transition-colors hover:bg-neutral-800 hover:text-neutral-200 lg:h-auto lg:w-auto lg:gap-1 lg:rounded-xl lg:border lg:border-neutral-800 lg:px-3.5 lg:py-2 lg:text-[10px] lg:font-black lg:tracking-wider lg:text-neutral-400 lg:uppercase"
															>
																<span class="hidden lg:inline">Open</span>
																<IconChevronRight size={16} class="lg:-mr-1" />
															</a>
														</div>
													</div>
												</article>
											</li>
										{/each}
									</ol>
								</section>
							{/if}
						{/each}
						{#if data.archived.length > 0}
							<section id="changes-archived" class="mt-8 scroll-mt-6 first:mt-1 lg:mt-12 lg:first:mt-0">
								<div class="mb-2 flex items-center gap-3 lg:mb-1">
									<span class="h-1.5 w-1.5 shrink-0 rounded-full bg-neutral-600" aria-hidden="true"></span>
									<h2 class="text-[11px] font-black tracking-[0.2em] text-neutral-300 uppercase">Recently archived</h2>
									<span class="rounded-full border border-neutral-800 bg-neutral-900 px-2 py-0.5 text-[10px] font-black text-neutral-400">{data.archived.length}</span>
									<span class="h-px flex-1 bg-neutral-800/80" aria-hidden="true"></span>
								</div>
								<p class="mb-3 text-xs font-medium text-neutral-600 lg:mb-6">
									{data.hasPriorExport ? 'Archived since the last export. Archived photos are left out of exports.' : 'Archived photos are left out of exports.'}
								</p>

								<ol class="grid grid-cols-1 gap-3 lg:gap-0">
									{#each data.archived as item (item.imageId)}
										<li class="relative lg:grid lg:grid-cols-[4.5rem_minmax(0,1fr)] lg:gap-8 lg:pb-8 lg:last:pb-0">
											<span class="absolute top-0 bottom-0 left-[5.5rem] hidden w-px -translate-x-1/2 bg-neutral-800 lg:block" aria-hidden="true"></span>
											<span class="absolute top-3.5 left-[5.5rem] hidden h-2 w-2 -translate-x-1/2 rounded-full bg-neutral-600 ring-4 ring-black lg:block" aria-hidden="true"></span>
											<div class="hidden pt-2 text-right text-[11px] leading-tight font-medium tabular-nums lg:block">
												<time datetime={new Date(item.at).toISOString()} class="block text-neutral-500">{formatShortDay(item.at)}</time>
												<span class="block text-neutral-600">{formatTime(item.at)}</span>
											</div>

											<article
												class="grid grid-cols-2 gap-1.5 overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-900/30 p-1.5 transition-colors hover:border-neutral-700 lg:gap-2 lg:rounded-3xl lg:bg-neutral-900/40 lg:p-2"
											>
												<a href="/editor/{item.imageId}" class="block focus-visible:outline-none" title="Open {item.name} in the editor">
													<figure class="relative overflow-hidden rounded-xl bg-neutral-900 lg:rounded-2xl">
														<img src={archivedThumbnail(item)} alt="{item.name}, archived" loading="lazy" class="aspect-[3/2] h-full w-full object-cover opacity-60" />
														<figcaption
															class="absolute top-2 left-2 rounded bg-black/70 px-2 py-1 text-[9px] font-black tracking-[0.15em] text-neutral-200 uppercase backdrop-blur"
														>
															Archived
														</figcaption>
													</figure>
												</a>

												<div class="flex min-w-0 flex-col justify-between gap-2 p-1 lg:p-3">
													<div class="min-w-0">
														<p class="text-xs leading-snug font-medium text-neutral-500 lg:hidden">Archived {formatMoment(item.at)}</p>
														<p class="hidden text-sm font-bold text-neutral-200 lg:block">Archived</p>
														<p class="mt-1 hidden text-xs font-medium text-neutral-500 lg:block">Left out of exports. Restore it to export it again.</p>
													</div>
													<div class="flex items-center justify-end gap-1 lg:gap-2">
														<button
															type="button"
															onclick={() => restoreArchived(item)}
															disabled={restoringId !== null}
															title="Restore this photo to the session"
															class="flex shrink-0 items-center gap-1.5 rounded-lg border border-neutral-700 bg-neutral-900/70 px-2.5 py-1.5 text-[10px] font-black tracking-wider text-neutral-300 uppercase transition-colors hover:border-neutral-500 hover:bg-neutral-800 hover:text-neutral-100 disabled:cursor-not-allowed disabled:opacity-60 lg:rounded-xl lg:px-3.5 lg:py-2"
														>
															<IconArrowBackUp size={13} />
															{restoringId === item.imageId ? 'Restoring…' : 'Restore'}
														</button>
														<a
															href="/editor/{item.imageId}"
															aria-label="Open {item.name} in the editor"
															title="Open in editor"
															class="hidden shrink-0 items-center gap-1 rounded-xl border border-neutral-800 px-3.5 py-2 text-[10px] font-black tracking-wider text-neutral-400 uppercase transition-colors hover:bg-neutral-800 hover:text-neutral-200 lg:flex"
														>
															Open
															<IconChevronRight size={16} class="-mr-1" />
														</a>
													</div>
												</div>
											</article>
										</li>
									{/each}
								</ol>
							</section>
						{/if}
					</div>

					<!-- Summary rail, desktop only -->
					<aside class="sticky top-6 hidden rounded-3xl border border-neutral-800 bg-neutral-900/40 p-6 lg:block">
						<p class="text-[10px] font-black tracking-[0.2em] text-neutral-500 uppercase">Pending</p>
						<p class="mt-1 text-5xl font-black tracking-tighter text-neutral-100 italic tabular-nums">{pendingCount}</p>
						<p class="mt-1 text-xs font-medium text-neutral-500">{pendingCount === 1 ? 'photo will be exported' : 'photos will be exported'}</p>

						<nav class="mt-6 flex flex-col border-t border-neutral-800 pt-3" aria-label="Change types">
							{#each sections as section (section.key)}
								{#if section.changes.length > 0}
									<a
										href="#changes-{section.key}"
										class="-mx-2 flex items-center gap-3 rounded-xl px-2 py-2 text-sm font-medium text-neutral-400 transition-colors hover:bg-neutral-800/60 hover:text-neutral-100"
									>
										<span class="h-1.5 w-1.5 shrink-0 rounded-full {section.dot}" aria-hidden="true"></span>
										<span class="flex-1">{section.short}</span>
										<span class="font-bold text-neutral-200 tabular-nums">{section.changes.length}</span>
									</a>
								{/if}
							{/each}
							{#if data.archived.length > 0}
								<a
									href="#changes-archived"
									class="-mx-2 flex items-center gap-3 rounded-xl px-2 py-2 text-sm font-medium text-neutral-400 transition-colors hover:bg-neutral-800/60 hover:text-neutral-100"
								>
									<span class="h-1.5 w-1.5 shrink-0 rounded-full bg-neutral-600" aria-hidden="true"></span>
									<span class="flex-1">Archived</span>
									<span class="font-bold text-neutral-200 tabular-nums">{data.archived.length}</span>
								</a>
							{/if}
						</nav>

						<dl class="mt-3 border-t border-neutral-800 pt-4 text-xs">
							<div class="flex justify-between gap-3">
								<dt class="font-medium text-neutral-500">Last export</dt>
								<dd class="text-right font-bold text-neutral-300">{data.lastExportedAt ? formatDay(data.lastExportedAt) : 'Never'}</dd>
							</div>
							<div class="mt-2 flex justify-between gap-3">
								<dt class="font-medium text-neutral-500">In session</dt>
								<dd class="font-bold text-neutral-300 tabular-nums">{data.imageCount} {data.imageCount === 1 ? 'image' : 'images'}</dd>
							</div>
						</dl>

						<div class="mt-6">
							{@render exportAction(true)}
						</div>
					</aside>
				</div>
			{/if}
		</div>
	</div>
</div>

{#if pendingRevert}
	<ConfirmModal
		title={`Revert ${pendingRevert.name}?`}
		message={`This restores ${pendingRevert.name} to the version from the last export. ${editCountLabel(pendingRevert.editCount)}`}
		confirmLabel={reverting ? 'Reverting…' : 'Revert'}
		onConfirm={confirmRevert}
		onCancel={() => {
			if (!reverting) pendingRevert = null;
		}}
	/>
{/if}
