<script lang="ts">
	import { onDestroy } from 'svelte';
	import Modal from '$lib/ui/Modal.svelte';
	import { app } from '$lib/state/app.svelte.js';
	import { invalidateAll } from '$app/navigation';
	import SegmentedControl from '$lib/ui/SegmentedControl.svelte';
	import { slide } from 'svelte/transition';
	import SessionPicker from '$lib/ui/SessionPicker.svelte';
	import UploadProgress from '$lib/ui/UploadProgress.svelte';
	import { uploads } from '$lib/state/uploads.svelte';
	import { ImporterState, dateKey, type ImageItem } from '$lib/state/importer.svelte';
	import { autoScrollSpeed, dragSelection } from '$lib/drag-select';

	let { data } = $props();
	let selectedIds = $state<Set<number>>(new Set());
	function deselect(id: number) {
		selectedIds = selectedIds.difference(new Set([id]));
		if (!selectedIds.size) inSelectionMode = false;
	}
	const importer = new ImporterState(() => data.items, deselect);
	const duplicateCounts = $derived(importer.duplicateCounts);
	let loadedPreviews = $state(new Set<number>());
	let failedPreviews = $state(new Set<number>());
	const allItems = $derived(importer.allItems);
	const allIds = $derived(allItems.map((item) => item.id));

	// Core State
	function unavailable(id: number) {
		return importer.unavailable(id);
	}
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
	let scrollContainer = $state<HTMLDivElement>();

	// Advanced Selection State
	let inSelectionMode = $state(false);
	let isDragging = $state(false);
	let longPressTimer: number | null = null;
	let touchOrigin = { x: 0, y: 0 };
	let touchPoint = { x: 0, y: 0 };
	// A resting finger still reports tiny moves, so only real movement cancels a long-press
	const LONG_PRESS_SLOP_PX = 10;
	const LONG_PRESS_MS = 450;
	let lastSelectedIndex = $state(-1);
	let dragStartIndex = -1;
	let dragBaseline = new Set<number>();
	let dragAdding = true;
	// Browsers may still fire a click after a long-press; it must not toggle the photo back off.
	// The next touch clears it, since that click always arrives before another touch starts.
	let suppressTouchClick = false;

	// Auto-scroll State
	let scrollFrame: number | null = null;

	let groupedByDate = $derived.by(() => {
		const groups: Map<string, ImageItem[]> = Map.groupBy(allItems, (item) => dateKey(item.date));
		for (const key of Object.keys(duplicateCounts)) {
			if (duplicateCounts[key] && !groups.has(key)) groups.set(key, []);
		}
		return Array.from(groups.entries())
			.sort(([a], [b]) => Number(b) - Number(a))
			.map(([key, images]) => ({
				key,
				date: new Date(Number(key)).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }),
				images,
				duplicates: duplicateCounts[key] ?? 0
			}));
	});

	// --- Event Handlers ---

	/** Starts a drag selection from a photo, remembering what was selected before it. */
	function beginDragSelection(index: number) {
		dragStartIndex = index;
		dragBaseline = new Set(selectedIds);
		dragAdding = !selectedIds.has(allIds[index]);
		selectedIds = selectRange(index, index);
		lastSelectedIndex = index;
	}

	function selectRange(startIndex: number, currentIndex: number) {
		return dragSelection(dragBaseline, allIds, startIndex, currentIndex, dragAdding, (id) => !unavailable(id));
	}

	function extendDragSelection(clientX: number, clientY: number) {
		const card = document.elementFromPoint(clientX, clientY)?.closest<HTMLElement>('[data-index]');
		if (!card || dragStartIndex < 0) return;
		const index = Number(card.dataset.index);
		selectedIds = selectRange(dragStartIndex, index);
		lastSelectedIndex = index;
		inSelectionMode = selectedIds.size > 0;
	}

	function handleTouchStart(event: TouchEvent, id: number, index: number) {
		cancelLongPress();
		suppressTouchClick = false;
		if (event.touches.length !== 1) return;
		touchOrigin = touchPoint = { x: event.touches[0].clientX, y: event.touches[0].clientY };
		if (unavailable(id)) return;
		longPressTimer = window.setTimeout(() => {
			longPressTimer = null;
			inSelectionMode = true;
			isDragging = true;
			suppressTouchClick = true;
			beginDragSelection(index);
			navigator.vibrate?.(20);
		}, LONG_PRESS_MS);
	}

	function cancelLongPress() {
		if (longPressTimer) {
			clearTimeout(longPressTimer);
			longPressTimer = null;
		}
	}

	function handleTouchMove(event: TouchEvent) {
		const touch = event.touches[0];
		if (!touch) return;
		touchPoint = { x: touch.clientX, y: touch.clientY };
		if (event.touches.length > 1 || Math.hypot(touch.clientX - touchOrigin.x, touch.clientY - touchOrigin.y) > LONG_PRESS_SLOP_PX) cancelLongPress();
		if (!isDragging) return;
		extendDragSelection(touch.clientX, touch.clientY);
		updateAutoScroll(touch.clientY);
	}

	// Svelte's ontouchmove is passive; a native listener lets a selection drag stop the list from scrolling
	$effect(() => {
		const container = scrollContainer;
		if (!container) return;
		const block = (event: TouchEvent) => {
			if (isDragging && event.cancelable) event.preventDefault();
		};
		container.addEventListener('touchmove', block, { passive: false });
		return () => container.removeEventListener('touchmove', block);
	});

	function handleTouchEnd() {
		cancelLongPress();
		stopScrolling();
		isDragging = false;
		dragStartIndex = -1;
		if (!selectedIds.size) inSelectionMode = false;
	}

	function handleClick(id: number, index: number, event: MouseEvent) {
		if (suppressClick) {
			suppressClick = false;
			return;
		}
		if (suppressTouchClick) {
			suppressTouchClick = false;
			return;
		}
		if (unavailable(id)) return;
		if (!inSelectionMode) {
			inSelectionMode = true;
		}

		if (event.shiftKey && lastSelectedIndex !== -1) {
			selectedIds = dragSelection(selectedIds, allIds, lastSelectedIndex, index, true, (candidate) => !unavailable(candidate));
		} else if (selectedIds.has(id)) {
			selectedIds = selectedIds.difference(new Set([id]));
		} else {
			selectedIds = selectedIds.union(new Set([id]));
		}
		lastSelectedIndex = index;

		if (selectedIds.size === 0) {
			inSelectionMode = false;
		}
	}

	/**
	 * Scrolls the photo list while the finger rests near its top or bottom edge, and
	 * keeps extending the selection as new photos pass under the finger. The list
	 * scrolls inside its own container, so the window edges are irrelevant.
	 */
	function updateAutoScroll(clientY: number) {
		if (!scrollContainer) return;
		const rect = scrollContainer.getBoundingClientRect();
		if (!autoScrollSpeed(clientY, rect.top, rect.bottom)) return stopScrolling();
		if (scrollFrame) return;
		const step = () => {
			const container = scrollContainer;
			if (!container || !isDragging) return stopScrolling();
			const bounds = container.getBoundingClientRect();
			const speed = autoScrollSpeed(touchPoint.y, bounds.top, bounds.bottom);
			if (!speed) return stopScrolling();
			container.scrollTop += speed;
			extendDragSelection(touchPoint.x, touchPoint.y);
			scrollFrame = requestAnimationFrame(step);
		};
		scrollFrame = requestAnimationFrame(step);
	}

	function stopScrolling() {
		if (scrollFrame) {
			cancelAnimationFrame(scrollFrame);
			scrollFrame = null;
		}
	}

	function toggleDateSelection(images: ImageItem[]) {
		const groupIds = new Set(images.filter((item) => !unavailable(item.id)).map((img) => img.id));
		selectedIds = groupIds.isSubsetOf(selectedIds) ? selectedIds.difference(groupIds) : selectedIds.union(groupIds);
		inSelectionMode = selectedIds.size > 0;
	}

	function clearSelection() {
		selectedIds = new Set();
		lastSelectedIndex = -1;
		inSelectionMode = false;
	}

	onDestroy(() => {
		importer.dispose();
		handleTouchEnd();
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
			const items = allItems.filter((item) => body.importIds.includes(item.id) && !unavailable(item.id));
			const target = importMode === 'new' ? { name: sessionName.trim() } : { sessionId: selectedSessionId! };
			showModal = false;
			clearSelection();
			void importer.assign(items, target);
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
			importer.stage(target.files);
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
			importer.stage(e.dataTransfer.files);
		}
		fileDragDepth = 0;
	}

	function handleMouseMove(e: MouseEvent) {
		if (!mouseStart || !(e.buttons & 1)) return;
		if (!mouseSelecting && Math.hypot(e.clientX - mouseStart.x, e.clientY - mouseStart.y) < 5) return;
		if (!mouseSelecting) {
			if (unavailable(mouseStart.id)) return;
			mouseSelecting = true;
			suppressClick = true;
			beginDragSelection(mouseStart.index);
		}
		extendDragSelection(e.clientX, e.clientY);
	}
</script>

<svelte:window
	onmousemove={handleMouseMove}
	onmouseup={() => {
		mouseStart = undefined;
		mouseSelecting = false;
		dragStartIndex = -1;
	}}
	onblur={() => {
		mouseStart = undefined;
		mouseSelecting = false;
		isDraggingFile = false;
		fileDragDepth = 0;
	}}
/>

<div class="flex h-full min-h-0 flex-col bg-black">
	<div class="h-2 shrink-0 px-6 pt-1 lg:px-12"><UploadProgress /></div>
	<div
		bind:this={scrollContainer}
		class="relative min-h-0 flex-1 overflow-y-auto bg-black p-6 lg:p-12"
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
		{#if isDraggingFile}
			<div class="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md">
				<div class="rounded-3xl border-2 border-dashed border-neutral-700 bg-neutral-900/80 p-16 shadow-2xl transition-all">
					<p class="text-3xl font-black tracking-tighter text-neutral-100 italic">
						DROP <span class="text-xl font-light tracking-normal text-neutral-500 uppercase not-italic">to import</span>
					</p>
				</div>
			</div>
		{/if}

		<div class="mx-auto max-w-7xl">
			<div class="mb-12 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
				<div>
					<p class="max-w-md font-medium text-neutral-400">
						Scanning <code class="rounded bg-neutral-900 px-1.5 py-0.5 text-sm text-neutral-100">IMPORT_DIR</code> (and IMPORT_EXTRA_DIRS) for new RAW files.
					</p>
				</div>

				<div class="flex items-center gap-3">
					<button
						onclick={handleRefresh}
						class="group flex items-center gap-3 rounded-2xl bg-neutral-100 px-8 py-3 text-sm font-bold text-neutral-950 transition-all hover:scale-105 hover:bg-white disabled:opacity-50"
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

					<div class="mx-1 h-10 w-[1px] bg-neutral-800"></div>

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

			<div class="pb-32" ontouchend={handleTouchEnd} ontouchcancel={handleTouchEnd} role="presentation">
				{#if !groupedByDate.length}
					{@render empty()}
				{:else}
					{#each groupedByDate as group (group.key)}
						{@const groupSelectable = group.images.filter((item) => !unavailable(item.id))}
						{@const groupSelected = groupSelectable.length > 0 && groupSelectable.every((item) => selectedIds.has(item.id))}
						<div class="mt-12 mb-8 flex items-center justify-between">
							<div class="flex flex-wrap items-center gap-3">
								<h2 class="text-2xl font-bold tracking-tight text-neutral-100">{group.date}</h2>
								{#if group.duplicates > 0}
									<span class="rounded-full bg-neutral-800 px-3 py-1 text-sm font-semibold text-neutral-300" role="status"
										>{group.duplicates} duplicate{group.duplicates === 1 ? '' : 's'}</span
									>
								{/if}
							</div>
							{#if groupSelectable.length}
								<button
									onclick={() => toggleDateSelection(group.images)}
									class="text-sm font-bold text-neutral-500 transition-colors hover:text-neutral-100"
									aria-pressed={groupSelected}
								>
									{groupSelected ? 'Deselect All' : 'Select All'}
								</button>
							{/if}
						</div>
						<div class="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
							{#each group.images as item (item.id)}
								{@const itemIndex = allItems.indexOf(item)}
								<button
									data-id={item.id}
									data-index={itemIndex}
									disabled={unavailable(item.id)}
									class="photo-card group relative aspect-[3/2] overflow-hidden rounded-2xl bg-neutral-900 ring-offset-black transition-all select-none"
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
									{#if item.id >= 0 || item.url || item.importId !== undefined}
										<img
											src={item.url ?? `/api/imports/${item.importId ?? item.id}/preview`}
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

									{#if item.status === 'assigned'}
										<span
											class="absolute top-3 left-3 flex h-7 w-7 items-center justify-center rounded-full bg-black/70 text-white"
											title="Assigned to a session"
											aria-label="Assigned to a session"
											role="img"
										>
											<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m5 12 4 4L19 6" /></svg>
										</span>
									{:else if item.file && item.importId === undefined}
										<span
											class="absolute top-3 left-3 flex h-7 w-7 items-center justify-center rounded-full bg-black/70 text-white"
											title={item.status === 'uploading' ? 'Uploading' : 'Local file — not uploaded'}
											aria-label={item.status === 'uploading' ? 'Uploading' : 'Local file — not uploaded'}
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
			class:pointer-events-none={selectedIds.size === 0}
			inert={selectedIds.size === 0}
			aria-hidden={selectedIds.size === 0}
		>
			<div class="flex items-center gap-2">
				<button onclick={clearSelection} class="rounded-2xl px-6 py-3 text-sm font-bold text-neutral-500 transition-colors hover:text-neutral-100"> Cancel </button>
				<button
					class="flex items-center gap-3 rounded-2xl bg-neutral-100 px-10 py-3 text-sm font-black tracking-tight text-neutral-950 transition-all hover:scale-105 hover:bg-white"
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
			<Modal onClose={() => (showModal = false)} class="shadow-3xl !max-w-md !rounded-[2rem] !border-neutral-800 !bg-neutral-950">
				<div class="p-10">
					<h1 class="mb-2 text-3xl leading-none font-black tracking-tighter text-neutral-100 uppercase italic">
						Initialize <span class="font-light text-neutral-500 not-italic">Session</span>
					</h1>
					<p class="mb-10 leading-relaxed font-medium text-neutral-400">Organize your {selectedIds.size} selected images into a workspace.</p>

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
								<label for="session-name" class="mb-3 block text-xs font-bold tracking-widest text-neutral-500 uppercase">Name your Session</label>
								<input
									id="session-name"
									type="text"
									bind:value={sessionName}
									placeholder="e.g. Iceland Expedition 2026"
									class="w-full rounded-2xl border border-neutral-800 bg-neutral-900/50 p-4 text-neutral-100 transition-all outline-none placeholder:text-neutral-700 focus:border-neutral-100"
									required
								/>
							</div>
						{:else}
							<div transition:slide|local>
								<label for="session-select" class="mb-3 block text-xs font-bold tracking-widest text-neutral-500 uppercase">Choose Session</label>
								<SessionPicker sessions={data.sessions} bind:value={selectedSessionId} />
							</div>
						{/if}

						<div class="flex flex-col gap-3 pt-4">
							<button
								class="w-full rounded-2xl bg-neutral-100 py-4 text-sm font-black tracking-tight text-neutral-950 transition-all hover:scale-[1.02] hover:bg-white disabled:opacity-50"
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
</div>

<style>
	/* A long-press selects the photo; it must not open iOS's image callout instead */
	.photo-card,
	.photo-card :global(img) {
		-webkit-touch-callout: none;
		-webkit-user-select: none;
		user-select: none;
	}
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
