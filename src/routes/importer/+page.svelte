<script lang="ts">
	import { onDestroy } from 'svelte';
	import Modal from '$lib/ui/Modal.svelte';
	import type { Import } from '$lib/server/db/schema';
	import { app } from '$lib/state/app.svelte.js';
	import { invalidateAll } from '$app/navigation';
	import SegmentedControl from '$lib/ui/SegmentedControl.svelte';
	import { slide } from 'svelte/transition';
	import SessionPicker from '$lib/ui/SessionPicker.svelte';
	import pLimit from 'p-limit';

	let { data } = $props();

	// Core State
	let selectedIds = $state<Set<number>>(new Set());
	let showModal = $state(false);
	let sessionName = $state('');
	let isCreating = $state(false);
	let importMode = $state<'new' | 'existing'>('new');
	let selectedSessionId = $state<number | null>(null);
	let isRefreshing = $state(false);
	let isUploading = $state(false);
	let uploadProgress = $state(0);
	let isDraggingFile = $state(false);
	let fileInput: HTMLInputElement;
	let importPollingIntervals: Record<number, ReturnType<typeof setInterval>> = {};

	type ImportJobStatus = 'idle' | 'running' | 'success' | 'error' | 'cancelled';
	type ImportJobState = {
		status: ImportJobStatus;
		message?: string;
	};

	// Advanced Selection State
	let inSelectionMode = $state(false);
	let isDragging = $state(false);
	let longPressTimer: number | null = null;
	let lastSelectedIndex = $state(-1);
	let dragStartIndex = $state(-1);

	// Auto-scroll State
	let scrollInterval: number | null = null;

	let groupedByDate = $derived.by(() => {
		const groups = new Map<string, Import[]>();
		data.items.forEach((item) => {
			const date = new Date(item.date).toLocaleDateString(undefined, {
				year: 'numeric',
				month: 'long',
				day: 'numeric'
			});
			if (!groups.has(date)) {
				groups.set(date, []);
			}
			groups.get(date)!.push(item);
		});
		return Array.from(groups.entries()).map(([date, images]) => ({ date, images }));
	});

	// --- Event Handlers ---

	function handleTouchStart(event: TouchEvent, id: number, index: number) {
		longPressTimer = window.setTimeout(() => {
			longPressTimer = null;
			inSelectionMode = true;
			isDragging = true;
			dragStartIndex = index;
			event.preventDefault();
			selectedIds.add(id);
			selectedIds = new Set(selectedIds);
		}, 500);
	}

	function handleTouchMove(event: TouchEvent) {
		if (longPressTimer) {
			clearTimeout(longPressTimer);
			longPressTimer = null;
		}

		if (!isDragging) return;

		const touch = event.touches[0];
		const element = document.elementFromPoint(touch.clientX, touch.clientY);
		const targetButton = element?.closest<HTMLButtonElement>('[data-index]');

		if (targetButton) {
			const currentIndex = Number(targetButton.dataset.index);
			const start = Math.min(dragStartIndex, currentIndex);
			const end = Math.max(dragStartIndex, currentIndex);

			const rangeIds = new Set<number>();
			for (let i = start; i <= end; i++) {
				rangeIds.add(data.items[i].id);
			}
			selectedIds = new Set([...selectedIds, ...rangeIds]);
		}

		const scrollThreshold = 80;
		if (touch.clientY < scrollThreshold) {
			startScrolling('up');
		} else if (touch.clientY > window.innerHeight - scrollThreshold) {
			startScrolling('down');
		} else {
			stopScrolling();
		}
	}

	function handleTouchEnd() {
		if (longPressTimer) {
			clearTimeout(longPressTimer);
			longPressTimer = null;
		}
		stopScrolling();
		isDragging = false;
		dragStartIndex = -1;
	}

	function handleClick(id: number, index: number, event: MouseEvent) {
		if (!inSelectionMode) {
			inSelectionMode = true;
		}

		if (event.shiftKey && lastSelectedIndex !== -1) {
			const start = Math.min(lastSelectedIndex, index);
			const end = Math.max(lastSelectedIndex, index);
			for (let i = start; i <= end; i++) {
				selectedIds.add(data.items[i].id);
			}
		} else if (selectedIds.has(id)) {
			selectedIds.delete(id);
		} else {
			selectedIds.add(id);
		}

		selectedIds = new Set(selectedIds);
		lastSelectedIndex = index;

		if (selectedIds.size === 0) {
			inSelectionMode = false;
		}
	}

	function startScrolling(direction: 'up' | 'down') {
		if (scrollInterval) return;
		scrollInterval = window.setInterval(() => {
			window.scrollBy(0, direction === 'up' ? -20 : 20);
		}, 50);
	}

	function stopScrolling() {
		if (scrollInterval) {
			clearInterval(scrollInterval);
			scrollInterval = null;
		}
	}

	function selectAll() {
		selectedIds = new Set(data.items.map((item) => item.id));
		inSelectionMode = true;
	}

	function toggleDateSelection(images: Import[]) {
		const allIdsInGroup = images.map((img) => img.id);
		const allAreSelected = allIdsInGroup.every((id) => selectedIds.has(id));

		if (allAreSelected) {
			allIdsInGroup.forEach((id) => selectedIds.delete(id));
		} else {
			allIdsInGroup.forEach((id) => selectedIds.add(id));
		}
		selectedIds = new Set(selectedIds);
		inSelectionMode = selectedIds.size > 0;
	}

	function clearSelection() {
		selectedIds = new Set();
		lastSelectedIndex = -1;
		inSelectionMode = false;
	}

	function stopImportPolling(sessionId: number) {
		const intervalId = importPollingIntervals[sessionId];
		if (!intervalId) return;
		clearInterval(intervalId);
		delete importPollingIntervals[sessionId];
	}

	function startImportPolling(sessionId: number) {
		stopImportPolling(sessionId);
		importPollingIntervals[sessionId] = setInterval(async () => {
			try {
				const response = await fetch(`/api/sessions/${sessionId}/import`);
				if (!response.ok) {
					throw new Error('Failed to fetch import status');
				}

				const state = (await response.json()) as ImportJobState;
				if (state.status === 'running') {
					return;
				}

				stopImportPolling(sessionId);
				await invalidateAll();

				if (state.status === 'success') {
					app.addToast('Import completed successfully.', 'success');
				} else if (state.status === 'cancelled') {
					app.addToast('Import was cancelled.', 'info');
				} else if (state.status === 'error') {
					app.addToast(state.message ? `Import failed: ${state.message}` : 'Import failed.', 'error');
				}
			} catch (error) {
				console.error('Failed to poll import status', error);
				stopImportPolling(sessionId);
				app.addToast('Failed to check import status.', 'error');
			}
		}, 2000);
	}

	onDestroy(() => {
		for (const sessionId of Object.keys(importPollingIntervals)) {
			stopImportPolling(Number(sessionId));
		}
	});

	async function importImages(e: Event) {
		e.preventDefault();
		isCreating = true;

		const body = {
			importIds: Array.from(selectedIds),
			name: importMode === 'new' ? sessionName : undefined,
			sessionId: importMode === 'existing' ? selectedSessionId : undefined
		};

		try {
			const response = await fetch('/api/imports', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body)
			});
			if (!response.ok) throw new Error('Failed to create session');
			const result = (await response.json()) as { sessionId?: number };
			app.addToast('Session created. Import started.', 'info');
			data.items = data.items.filter((item) => !selectedIds.has(item.id));
			clearSelection();
			sessionName = '';
			showModal = false;
			invalidateAll();
			if (typeof result.sessionId === 'number') {
				startImportPolling(result.sessionId);
			}
		} catch (error) {
			console.error('Creation failed', error);
			app.addToast('Failed to create session', 'error');
		} finally {
			isCreating = false;
		}
	}

	async function handleRefresh() {
		isRefreshing = true;
		try {
			const response = await fetch('/api/imports/run-import', {
				method: 'POST'
			});
			if (!response.ok) throw new Error('Failed to refresh imports');
			app.addToast('Import process initiated.', 'success');
			invalidateAll();
		} catch (error) {
			console.error('Refresh failed', error);
			app.addToast('Failed to refresh imports', 'error');
		} finally {
			isRefreshing = false;
		}
	}

	// TODO: Set locale from env
	const formatter = Intl.DateTimeFormat('de-DE', {
		hour: 'numeric',
		minute: 'numeric'
	});
	function formatTime(date: Date) {
		return formatter.format(new Date(date));
	}

	async function uploadFiles(files: FileList | File[]) {
		if (files.length === 0) return;
		app.addToast(`Starting upload of ${files.length} files...`, 'info');
		isUploading = true;
		uploadProgress = 0;
		const totalFiles = files.length;
		let uploadedCount = 0;

		const maxConcurrent = 3;
		const fileArray = Array.from(files);
		const limit = pLimit(maxConcurrent);

		const uploadFile = async (file: File) => {
			const formData = new FormData();
			formData.append('files', file);

			try {
				const response = await fetch('/api/imports/upload', {
					method: 'POST',
					body: formData
				});

				if (!response.ok) throw new Error('Upload failed');

				uploadedCount += 1;
				uploadProgress = (uploadedCount / totalFiles) * 100;
				invalidateAll();
			} catch (error) {
				console.error('Upload error:', error);
				app.addToast(`Failed to upload ${file.name}`, 'error');
			}
		};

		await Promise.all(fileArray.map((file) => limit(() => uploadFile(file))));

		app.addToast(`Successfully uploaded ${uploadedCount} files`, 'success');
		isUploading = false;
		uploadProgress = 0;
		invalidateAll();
	}

	function handleFileSelect(e: Event) {
		const target = e.target as HTMLInputElement;
		if (target.files) {
			uploadFiles(target.files);
		}
	}

	function handleDragOver(e: DragEvent) {
		e.preventDefault();
		e.stopPropagation();
	}

	function handleDrop(e: DragEvent) {
		e.preventDefault();
		e.stopPropagation();
		if (e.dataTransfer?.files) {
			uploadFiles(e.dataTransfer.files);
		}
	}
</script>

<div
	class="relative h-full overflow-y-auto bg-black p-6 lg:p-12"
	role="presentation"
	ondragover={handleDragOver}
	ondrop={(e) => {
		handleDrop(e);
		isDraggingFile = false;
	}}
	ondragenter={(e) => {
		e.preventDefault();
		if (e.dataTransfer?.types.includes('Files')) isDraggingFile = true;
	}}
	ondragleave={() => (isDraggingFile = false)}
>
	{#if isDraggingFile}
		<div class="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md">
			<div class="rounded-3xl border-2 border-dashed border-neutral-700 bg-neutral-900/80 p-16 shadow-2xl transition-all">
				<p class="text-3xl font-black tracking-tighter text-neutral-100 italic">DROP <span class="text-neutral-500 not-italic font-light uppercase tracking-normal text-xl">to import</span></p>
			</div>
		</div>
	{/if}

	<div class="mx-auto max-w-7xl">
		<div class="mb-12 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
			<div>
				<p class="text-neutral-400 font-medium max-w-md">Scanning <code class="text-neutral-100 bg-neutral-900 px-1.5 py-0.5 rounded text-sm">IMPORT_DIR</code> for new RAW files.</p>
			</div>
			
			<div class="flex items-center gap-3">
				<button
					onclick={handleRefresh}
					class="group flex items-center gap-3 rounded-2xl bg-neutral-100 px-8 py-3 text-sm font-bold text-neutral-950 transition-all hover:bg-white hover:scale-105 disabled:opacity-50"
					disabled={isRefreshing}
				>
					{#if isRefreshing}
						<div class="h-4 w-4 animate-spin rounded-full border-2 border-neutral-950 border-t-transparent"></div>
						Syncing...
					{:else}
						<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/></svg>
						Scan Directory
					{/if}
				</button>

				<div class="h-10 w-[1px] bg-neutral-800 mx-1"></div>

				<input type="file" multiple bind:this={fileInput} onchange={handleFileSelect} class="hidden" accept=".jpg,.jpeg,.png,.tif,.tiff,.arw,.nef,.cr2,.raf" />
				<button
					onclick={() => fileInput.click()}
					class="flex items-center gap-2 rounded-2xl border border-neutral-800 bg-neutral-900/40 px-5 py-3 text-xs font-bold text-neutral-500 transition-all hover:bg-neutral-900 hover:text-neutral-100 disabled:opacity-50"
					disabled={isUploading}
				>
					{#if isUploading}
						Uploading...
					{:else}
						<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
						Manual Upload
					{/if}
				</button>
			</div>
		</div>

		{#if isUploading}
			<div class="mb-12 h-2 w-full overflow-hidden rounded-full bg-neutral-900">
				<div class="h-full bg-neutral-100 transition-all duration-300" style="width: {uploadProgress}%"></div>
			</div>
		{/if}

		{#snippet empty()}
			<div class="flex h-[40vh] items-center justify-center rounded-3xl border border-neutral-800 bg-neutral-900/20">
				<div class="text-center">
					<div class="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-neutral-800 text-neutral-500">
						<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>
					</div>
					<h3 class="text-xl font-bold text-neutral-100">No images found</h3>
					<p class="mt-2 text-neutral-500">Drop files or click upload to begin.</p>
				</div>
			</div>
		{/snippet}

		<div class="pb-32" ontouchend={handleTouchEnd} role="presentation">
			{#if !data.items?.length}
				{@render empty()}
			{:else}
				{#each groupedByDate as group}
					<div class="mb-8 mt-12 flex items-center justify-between">
						<h2 class="text-2xl font-bold tracking-tight text-neutral-100">{group.date}</h2>
						<button
							onclick={() => toggleDateSelection(group.images)}
							class="text-sm font-bold text-neutral-500 hover:text-neutral-100 transition-colors"
						>
							Select All
						</button>
					</div>
					<div class="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
						{#each group.images as item}
							{@const itemIndex = data.items.indexOf(item)}
							<button
								data-id={item.id}
								data-index={itemIndex}
								class="group relative aspect-[3/2] overflow-hidden rounded-2xl bg-neutral-900 ring-offset-black transition-all"
								class:ring-4={selectedIds.has(item.id)}
								class:ring-neutral-100={selectedIds.has(item.id)}
								onclick={(e) => handleClick(item.id, itemIndex, e)}
								ontouchstart={(e) => handleTouchStart(e, item.id, itemIndex)}
								ontouchmove={handleTouchMove}
								oncontextmenu={(e) => { e.preventDefault(); }}
							>
								<img
									src={`/api/imports/${item.id}/preview`}
									alt=""
									loading="lazy"
									class="h-full w-full object-cover transition-all duration-500 group-hover:scale-110"
									class:opacity-50={selectedIds.has(item.id)}
								/>
								
								<div class="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 transition-opacity group-hover:opacity-100"></div>

								<div class="absolute bottom-4 left-4 flex flex-col items-start opacity-0 transition-all translate-y-2 group-hover:opacity-100 group-hover:translate-y-0">
									<span class="text-[10px] font-black uppercase tracking-widest text-neutral-400 mb-1">Recorded</span>
									<span class="text-xs font-bold text-white uppercase">{formatTime(item.date)}</span>
								</div>

								{#if selectedIds.has(item.id)}
									<div class="absolute top-4 right-4 flex h-8 w-8 items-center justify-center rounded-full bg-neutral-100 text-neutral-950 shadow-xl">
										<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
									</div>
								{/if}
							</button>
						{/each}
					</div>
				{/each}
			{/if}
		</div>
	</div>

	<div class="fixed bottom-10 left-1/2 z-30 -translate-x-1/2 overflow-hidden rounded-3xl border border-neutral-800 bg-neutral-900/90 p-2 shadow-[0_32px_64px_-16px_rgba(0,0,0,0.8)] backdrop-blur-xl transition-all"
		 class:translate-y-32={selectedIds.size === 0}
		 class:opacity-0={selectedIds.size === 0}
	>
		<div class="flex items-center gap-2">
			<button onclick={clearSelection} class="rounded-2xl px-6 py-3 text-sm font-bold text-neutral-500 transition-colors hover:text-neutral-100">
				Cancel
			</button>
			<button
				class="flex items-center gap-3 rounded-2xl bg-neutral-100 px-10 py-3 text-sm font-black tracking-tight text-neutral-950 transition-all hover:bg-white hover:scale-105"
				onclick={() => (showModal = true)}
			>
				IMPORT {selectedIds.size} {selectedIds.size > 1 ? 'FILES' : 'FILE'}
				<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
			</button>
		</div>
	</div>

	{#if showModal}
		<Modal onClose={() => (showModal = false)} class="!max-w-md !rounded-[2rem] !border-neutral-800 !bg-neutral-950 shadow-3xl">
			<div class="p-10">
				<h1 class="mb-2 text-3xl font-black tracking-tighter text-neutral-100 italic uppercase leading-none">Initialize <span class="text-neutral-500 not-italic font-light">Session</span></h1>
				<p class="mb-10 text-neutral-400 font-medium leading-relaxed">Organize your {selectedIds.size} selected images into a workspace.</p>
				
				<form onsubmit={importImages} class="flex flex-col gap-8">
					{#if data.sessions.length > 0}
						<SegmentedControl
							bind:value={importMode}
							options={[
								{ label: 'New', value: 'new' },
								{ label: 'Existing', value: 'existing' }
							]}
						/>
					{/if}

					{#if importMode === 'new' || data.sessions.length === 0}
						<div transition:slide|local>
							<label for="session-name" class="mb-3 block text-xs font-bold uppercase tracking-widest text-neutral-500">Name your Session</label>
							<input
								id="session-name"
								type="text"
								bind:value={sessionName}
								placeholder="e.g. Iceland Expedition 2026"
								class="w-full rounded-2xl border border-neutral-800 bg-neutral-900/50 p-4 text-neutral-100 outline-none transition-all focus:border-neutral-100 placeholder:text-neutral-700"
								required
							/>
						</div>
					{:else}
						<div transition:slide|local>
							<label for="session-select" class="mb-3 block text-xs font-bold uppercase tracking-widest text-neutral-500">Choose Session</label>
							<SessionPicker sessions={data.sessions} bind:value={selectedSessionId} />
						</div>
					{/if}

					<div class="flex flex-col gap-3 pt-4">
						<button class="w-full rounded-2xl bg-neutral-100 py-4 text-sm font-black tracking-tight text-neutral-950 transition-all hover:bg-white hover:scale-[1.02] disabled:opacity-50" type="submit" disabled={isCreating}>
							{isCreating ? 'PROCESSING...' : 'CONFIRM IMPORT'}
						</button>
						<button type="button" onclick={() => (showModal = false)} class="w-full py-2 text-sm font-bold text-neutral-600 transition-colors hover:text-neutral-400">
							Nevermind
						</button>
					</div>
				</form>
			</div>
		</Modal>
	{/if}
</div>

<style>
	/* Elegant Scrollbar */
	:global(::-webkit-scrollbar) {
		width: 6px;
	}
	:global(::-webkit-scrollbar-track) {
		background: black;
	}
	:global(::-webkit-scrollbar-thumb) {
		background: #262626;
		border-radius: 10px;
	}
	:global(::-webkit-scrollbar-thumb:hover) {
		background: #404040;
	}
</style>
