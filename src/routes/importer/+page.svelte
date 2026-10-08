<script lang="ts">
	import { onDestroy } from 'svelte';
	import Modal from '$lib/ui/Modal.svelte';
	import type { Import } from '$lib/server/db/schema';
	import { app } from '$lib/state/app.svelte.js';
	import { invalidateAll } from '$app/navigation';
	import SegmentedControl from '$lib/ui/SegmentedControl.svelte';
	import { slide } from 'svelte/transition';
	import SessionPicker from '$lib/ui/SessionPicker.svelte';
	import { uploads } from '$lib/state/uploads.svelte';
	import UploadProgress from '$lib/ui/UploadProgress.svelte';
	import pLimit from 'p-limit';
	import { getLocalPreview, releaseLocalPreviewWorker } from '$lib/local-preview-client';
	import { assignPendingUploads } from '$lib/upload-assignment';

	let { data } = $props();
	type ImageItem = Pick<Import, 'id' | 'date'> & {
		file?: File;
		url?: string;
		previewError?: string;
		uploading?: boolean;
		importId?: number;
		uploadPromise?: Promise<number | undefined>;
		resolveUpload?: (id: number | undefined) => void;
		assigning?: boolean;
	};
	let localItems = $state<ImageItem[]>([]);
	let nextLocalId = -1;
	let alive = true;
	let loadedPreviews = $state(new Set<number>());
	let failedPreviews = $state(new Set<number>());
	const previewLimit = pLimit(2);
	let allItems = $derived<ImageItem[]>([...data.items.filter((item) => !localItems.some((local) => local.importId === item.id)), ...localItems]);

	function removeLocal(id: number) {
		const item = localItems.find((item) => item.id === id);
		if (item?.url) URL.revokeObjectURL(item.url);
		localItems = localItems.filter((item) => item.id !== id);
		selectedIds = new Set([...selectedIds].filter((selected) => selected !== id));
		if (!selectedIds.size) inSelectionMode = false;
	}

	function stage(files: FileList | File[]) {
		const batch: ImageItem[] = [];
		for (const file of Array.from(files)) {
			if (localItems.some((item) => item.file?.name === file.name && item.file.size === file.size && item.file.lastModified === file.lastModified)) continue;
			const id = nextLocalId--;
			let resolveUpload!: (id: number | undefined) => void;
			const uploadPromise = new Promise<number | undefined>((resolve) => {
				resolveUpload = resolve;
			});
			const entry = { id, file, date: new Date(file.lastModified), uploading: true, uploadPromise, resolveUpload };
			localItems.push(entry);
			batch.push(entry);
			void previewLimit(async () => {
				if (!alive || !localItems.some((item) => item.id === id)) return;
				try {
					const preview = await getLocalPreview(file);
					const url = preview.url;
					const item = localItems.find((item) => item.id === id);
					if (!alive || !item) {
						URL.revokeObjectURL(url);
						return;
					}
					item.url = url;
					if (preview.capturedAt) item.date = preview.capturedAt;
				} catch {
					const item = localItems.find((item) => item.id === id);
					if (alive && item) item.previewError = 'Preview unavailable';
				}
			});
		}
		void uploads.upload(
			batch.map((item) => item.file!),
			undefined,
			{
				onFileUploaded(file, importId, imported) {
					const entry = batch.find((item) => item.file === file)!;
					const item = localItems.find((item) => item.id === entry.id);
					if (item) {
						item.uploading = false;
						item.importId = importId;
					}
					entry.resolveUpload?.(imported ? undefined : importId);
					if (imported && alive) removeLocal(entry.id);
				},
				onFileFailed(file) {
					const entry = batch.find((item) => item.file === file)!;
					entry.resolveUpload?.(undefined);
					if (alive) removeLocal(entry.id);
				}
			}
		);
	}

	// Core State
	let selectedIds = $state<Set<number>>(new Set());
	let assigningIds = $state<Set<number>>(new Set());
	let showModal = $state(false);
	let sessionName = $state('');
	let isCreating = $state(false);
	let importMode = $state<'new' | 'existing'>('new');
	let selectedSessionId = $state<number | null>(null);
	let isRefreshing = $state(false);
	let isDraggingFile = $state(false);
	let fileDragDepth = 0;
	let mouseStart: { id: number; index: number; x: number; y: number } | undefined;
	let mouseSelecting = false;
	let suppressClick = false;
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
		const groups = new Map<string, ImageItem[]>();
		allItems.forEach((item) => {
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
			if (assigningIds.has(id)) return;
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
				const item = allItems[i];
				if (item && !assigningIds.has(item.id)) rangeIds.add(item.id);
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
		if (suppressClick) {
			suppressClick = false;
			return;
		}
		if (assigningIds.has(id)) return;
		if (!inSelectionMode) {
			inSelectionMode = true;
		}

		if (event.shiftKey && lastSelectedIndex !== -1) {
			const start = Math.min(lastSelectedIndex, index);
			const end = Math.max(lastSelectedIndex, index);
			for (let i = start; i <= end; i++) {
				if (!assigningIds.has(allItems[i].id)) selectedIds.add(allItems[i].id);
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
		selectedIds = new Set(allItems.filter((item) => !assigningIds.has(item.id)).map((item) => item.id));
		inSelectionMode = true;
	}

	function toggleDateSelection(images: ImageItem[]) {
		const allIdsInGroup = images.filter((item) => !assigningIds.has(item.id)).map((img) => img.id);
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
		alive = false;
		previewLimit.clearQueue();
		releaseLocalPreviewWorker();
		handleTouchEnd();
		for (const item of localItems) if (item.url) URL.revokeObjectURL(item.url);
		for (const sessionId of Object.keys(importPollingIntervals)) {
			stopImportPolling(Number(sessionId));
		}
	});

	async function importImages(e: Event) {
		e.preventDefault();
		if (isCreating || !selectedIds.size) return;
		if (importMode === 'new' && !sessionName.trim()) {
			app.addToast('Enter a session name.', 'info');
			return;
		}
		if (importMode === 'existing' && !selectedSessionId) {
			app.addToast('Choose a session.', 'info');
			return;
		}
		isCreating = true;

		const body = {
			importIds: Array.from(selectedIds),
			name: importMode === 'new' ? sessionName : undefined,
			sessionId: importMode === 'existing' ? selectedSessionId : undefined
		};

		try {
			const items = allItems.filter((item) => body.importIds.includes(item.id) && !assigningIds.has(item.id));
			const target = importMode === 'new' ? { name: sessionName.trim() } : { sessionId: selectedSessionId! };
			showModal = false;
			clearSelection();
			assigningIds = new Set([...assigningIds, ...items.map((item) => item.id)]);
			void assignPendingUploads(
				items.map((item) => item.uploadPromise ?? Promise.resolve(item.importId ?? item.id)),
				target,
				(index) => {
					if (alive) {
						const item = items[index];
						if (item.file) removeLocal(item.id);
						else data.items = data.items.filter((entry) => entry.id !== item.id);
					}
					void invalidateAll();
				},
				(error) => app.addToast(error instanceof Error ? error.message : 'Session assignment failed', 'error')
			).finally(() => {
				if (alive) assigningIds = new Set([...assigningIds].filter((id) => !items.some((item) => item.id === id)));
			});
			return;
		} catch (error) {
			console.error('Import assignment failed', error);
			app.addToast(error instanceof Error ? error.message : 'Failed to assign images', 'error');
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

	function handleFileSelect(e: Event) {
		const target = e.target as HTMLInputElement;
		if (target.files) {
			stage(target.files);
			target.value = '';
		}
	}

	function handleDragOver(e: DragEvent) {
		if (!e.dataTransfer?.types.includes('Files') || mouseStart || isDragging) return;
		e.preventDefault();
		e.stopPropagation();
		e.dataTransfer.dropEffect = 'copy';
	}

	function handleDrop(e: DragEvent) {
		if (!e.dataTransfer?.types.includes('Files') || mouseStart || isDragging) return;
		e.preventDefault();
		e.stopPropagation();
		if (e.dataTransfer?.files) {
			stage(e.dataTransfer.files);
		}
		fileDragDepth = 0;
	}

	function handleMouseMove(e: MouseEvent) {
		if (!mouseStart || !(e.buttons & 1)) return;
		if (!mouseSelecting && Math.hypot(e.clientX - mouseStart.x, e.clientY - mouseStart.y) < 5) return;
		const card = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLButtonElement>('[data-index]');
		if (!card) return;
		mouseSelecting = true;
		suppressClick = true;
		const index = Number(card.dataset.index);
		for (let i = Math.min(mouseStart.index, index); i <= Math.max(mouseStart.index, index); i++) {
			if (allItems[i] && !assigningIds.has(allItems[i].id)) selectedIds.add(allItems[i].id);
		}
		selectedIds = new Set(selectedIds);
		inSelectionMode = selectedIds.size > 0;
	}
</script>

<svelte:window
	onmousemove={handleMouseMove}
	onmouseup={() => {
		mouseStart = undefined;
		mouseSelecting = false;
	}}
	onblur={() => {
		mouseStart = undefined;
		mouseSelecting = false;
		isDraggingFile = false;
		fileDragDepth = 0;
	}}
/>

<div
	class="relative h-full overflow-y-auto bg-black p-6 lg:p-12"
	role="presentation"
	ondragover={handleDragOver}
	ondrop={(e) => {
		handleDrop(e);
		isDraggingFile = false;
	}}
	ondragenter={(e) => {
		if (!e.dataTransfer?.types.includes('Files') || mouseStart || isDragging) return;
		e.preventDefault();
		fileDragDepth += 1;
		isDraggingFile = true;
	}}
	ondragleave={() => {
		fileDragDepth = Math.max(0, fileDragDepth - 1);
		if (!fileDragDepth) isDraggingFile = false;
	}}
>
	<div class="sticky top-0 z-40"><UploadProgress /></div>
	{#if isDraggingFile}
		<div class="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md">
			<div class="rounded-3xl border-2 border-dashed border-neutral-700 bg-neutral-900/80 p-16 shadow-2xl transition-all">
				<p class="text-3xl font-black tracking-tighter text-neutral-100 italic">
					DROP <span class="text-neutral-500 not-italic font-light uppercase tracking-normal text-xl">to import</span>
				</p>
			</div>
		</div>
	{/if}

	<div class="mx-auto max-w-7xl">
		<div class="mb-12 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
			<div>
				<p class="text-neutral-400 font-medium max-w-md">
					Scanning <code class="text-neutral-100 bg-neutral-900 px-1.5 py-0.5 rounded text-sm">IMPORT_DIR</code> for new RAW files.
				</p>
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
						<svg
							xmlns="http://www.w3.org/2000/svg"
							width="18"
							height="18"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2.5"
							stroke-linecap="round"
							stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" /><path d="M21 3v5h-5" /></svg
						>
						Scan Directory
					{/if}
				</button>

				<div class="h-10 w-[1px] bg-neutral-800 mx-1"></div>

				<input type="file" multiple bind:this={fileInput} onchange={handleFileSelect} class="hidden" accept=".jpg,.jpeg,.png,.tif,.tiff,.arw,.nef,.cr2,.raf" />
				<button
					onclick={() => fileInput.click()}
					class="flex items-center gap-2 rounded-2xl border border-neutral-800 bg-neutral-900/40 px-5 py-3 text-xs font-bold text-neutral-500 transition-all hover:bg-neutral-900 hover:text-neutral-100 disabled:opacity-50"
				>
					{#if uploads.isUploading}
						Add More Files
					{:else}
						<svg
							xmlns="http://www.w3.org/2000/svg"
							width="14"
							height="14"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2.5"
							stroke-linecap="round"
							stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg
						>
						Manual Upload
					{/if}
				</button>
			</div>
		</div>

		{#snippet empty()}
			<div class="flex h-[40vh] items-center justify-center rounded-3xl border border-neutral-800 bg-neutral-900/20">
				<div class="text-center">
					<div class="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-neutral-800 text-neutral-500">
						<svg
							xmlns="http://www.w3.org/2000/svg"
							width="40"
							height="40"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="1.5"
							stroke-linecap="round"
							stroke-linejoin="round"
							><rect width="18" height="18" x="3" y="3" rx="2" ry="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" /></svg
						>
					</div>
					<h3 class="text-xl font-bold text-neutral-100">No images found</h3>
					<p class="mt-2 text-neutral-500">Drop files or click upload to begin.</p>
				</div>
			</div>
		{/snippet}

		<div class="pb-32" ontouchend={handleTouchEnd} role="presentation">
			{#if !allItems.length}
				{@render empty()}
			{:else}
				{#each groupedByDate as group}
					<div class="mb-8 mt-12 flex items-center justify-between">
						<h2 class="text-2xl font-bold tracking-tight text-neutral-100">{group.date}</h2>
						<button onclick={() => toggleDateSelection(group.images)} class="text-sm font-bold text-neutral-500 hover:text-neutral-100 transition-colors"> Select All </button>
					</div>
					<div class="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
						{#each group.images as item (item.id)}
							{@const itemIndex = allItems.indexOf(item)}
							<button
								data-id={item.id}
								data-index={itemIndex}
								disabled={assigningIds.has(item.id)}
								class="group relative aspect-[3/2] select-none overflow-hidden rounded-2xl bg-neutral-900 ring-offset-black transition-all"
								draggable={false}
								ondragstart={(e) => e.preventDefault()}
								onmousedown={(e) => {
									if (e.button === 0) {
										suppressClick = false;
										mouseStart = { id: item.id, index: itemIndex, x: e.clientX, y: e.clientY };
									}
								}}
								class:ring-4={selectedIds.has(item.id)}
								class:ring-neutral-100={selectedIds.has(item.id)}
								onclick={(e) => handleClick(item.id, itemIndex, e)}
								ontouchstart={(e) => handleTouchStart(e, item.id, itemIndex)}
								ontouchmove={handleTouchMove}
								oncontextmenu={(e) => {
									e.preventDefault();
								}}
							>
								{#if item.id >= 0 || item.url}
									<img
										src={item.url ?? `/api/imports/${item.id}/preview`}
										alt=""
										draggable={false}
										onload={() => {
											loadedPreviews = new Set([...loadedPreviews, item.id]);
										}}
										loading="lazy"
										class="h-full w-full object-cover transition-all duration-500 group-hover:scale-110"
										class:opacity-50={selectedIds.has(item.id)}
										onerror={() => {
											failedPreviews = new Set([...failedPreviews, item.id]);
											if (item.url) {
												URL.revokeObjectURL(item.url);
												item.url = undefined;
												item.previewError = 'Preview unavailable';
											}
										}}
									/>
								{/if}
								{#if !loadedPreviews.has(item.id)}
									<span class="absolute inset-0 flex items-center justify-center" role="status" aria-label={item.previewError ?? 'Loading preview'}>
										{#if item.previewError || failedPreviews.has(item.id)}
											<span class="text-xs text-neutral-400">{item.previewError ?? 'Preview unavailable'}</span>
										{:else}
											<span class="preview-shutter" aria-hidden="true"><span></span><span></span><span></span></span>
										{/if}
									</span>
								{/if}

								{#if item.file && item.importId === undefined}
									<span
										class="absolute top-3 left-3 flex h-7 w-7 items-center justify-center rounded-full bg-black/70 text-white"
										title={item.uploading ? 'Uploading' : 'Local file — not uploaded'}
										aria-label={item.uploading ? 'Uploading' : 'Local file — not uploaded'}
									>
										<svg
											width="16"
											height="16"
											viewBox="0 0 24 24"
											fill="none"
											stroke="currentColor"
											stroke-width="2"
											stroke-linecap="round"
											stroke-linejoin="round"
											aria-hidden="true"><path d="M12 16V4m-4 4 4-4 4 4M4 16v4h16v-4" /></svg
										>
									</span>
								{/if}

								{#if selectedIds.has(item.id)}
									<div class="absolute top-4 right-4 flex h-8 w-8 items-center justify-center rounded-full bg-neutral-100 text-neutral-950 shadow-xl">
										<svg
											xmlns="http://www.w3.org/2000/svg"
											width="20"
											height="20"
											viewBox="0 0 24 24"
											fill="none"
											stroke="currentColor"
											stroke-width="3"
											stroke-linecap="round"
											stroke-linejoin="round"><polyline points="20 6 9 17 4 12" /></svg
										>
									</div>
								{/if}
							</button>
						{/each}
					</div>
				{/each}
			{/if}
		</div>
	</div>

	<div
		class="fixed bottom-10 left-1/2 z-30 -translate-x-1/2 overflow-hidden rounded-3xl border border-neutral-800 bg-neutral-900/90 p-2 shadow-[0_32px_64px_-16px_rgba(0,0,0,0.8)] backdrop-blur-xl transition-all"
		class:translate-y-32={selectedIds.size === 0}
		class:opacity-0={selectedIds.size === 0}
	>
		<div class="flex items-center gap-2">
			<button onclick={clearSelection} class="rounded-2xl px-6 py-3 text-sm font-bold text-neutral-500 transition-colors hover:text-neutral-100"> Cancel </button>
			<button
				class="flex items-center gap-3 rounded-2xl bg-neutral-100 px-10 py-3 text-sm font-black tracking-tight text-neutral-950 transition-all hover:bg-white hover:scale-105"
				onclick={() => (showModal = true)}
			>
				IMPORT {selectedIds.size}
				{selectedIds.size > 1 ? 'FILES' : 'FILE'}
				<svg
					xmlns="http://www.w3.org/2000/svg"
					width="18"
					height="18"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="3"
					stroke-linecap="round"
					stroke-linejoin="round"><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg
				>
			</button>
		</div>
	</div>

	{#if showModal}
		<Modal onClose={() => (showModal = false)} class="!max-w-md !rounded-[2rem] !border-neutral-800 !bg-neutral-950 shadow-3xl">
			<div class="p-10">
				<h1 class="mb-2 text-3xl font-black tracking-tighter text-neutral-100 italic uppercase leading-none">
					Initialize <span class="text-neutral-500 not-italic font-light">Session</span>
				</h1>
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
						<button
							class="w-full rounded-2xl bg-neutral-100 py-4 text-sm font-black tracking-tight text-neutral-950 transition-all hover:bg-white hover:scale-[1.02] disabled:opacity-50"
							type="submit"
							disabled={isCreating}
						>
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
	.preview-shutter {
		display: flex;
		align-items: center;
		gap: 2px;
		width: 16px;
		height: 12px;
	}
	.preview-shutter > span {
		width: 4px;
		height: 10px;
		background: #fff;
		opacity: 0.3;
		transform: scaleY(0.35);
		animation: shutter-reveal 2.8s ease-in-out infinite;
	}
	.preview-shutter > span:nth-child(2) {
		animation-delay: 0.16s;
	}
	.preview-shutter > span:nth-child(3) {
		animation-delay: 0.32s;
	}
	@keyframes shutter-reveal {
		0%,
		65%,
		100% {
			transform: scaleY(0.35);
			opacity: 0.3;
		}
		25%,
		40% {
			transform: scaleY(1);
			opacity: 0.75;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.preview-shutter > span {
			animation: none;
			transform: none;
			opacity: 0.5;
		}
	}
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
