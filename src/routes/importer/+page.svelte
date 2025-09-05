<script lang="ts">
	import Modal from '$lib/ui/Modal.svelte';
	import { preventDefault } from 'svelte/legacy';
	import type { Import } from '$lib/server/db/schema';
	import { app } from '$lib/state/app.svelte.js';
	import { invalidateAll } from '$app/navigation';
	import SegmentedControl from '$lib/ui/SegmentedControl.svelte';
	import { slide } from 'svelte/transition';
	import SessionPicker from '$lib/ui/SessionPicker.svelte';

	let { data } = $props();

	// Core State
	let selectedIds = $state<Set<number>>(new Set());
	let showModal = $state(false);
	let sessionName = $state('');
	let isCreating = $state(false);
	let importMode = $state<'new' | 'existing'>('new');
	let selectedSessionId = $state<number | null>(null);

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
			app.addToast('Session created successfully', 'success');
			data.items = data.items.filter((item) => !selectedIds.has(item.id));
			clearSelection();
			sessionName = '';
			showModal = false;
			invalidateAll();
		} catch (error) {
			console.error('Creation failed', error);
			app.addToast('Failed to create session', 'error');
		} finally {
			isCreating = false;
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
</script>

{#snippet empty()}
	<div class="flex h-64 items-center justify-center">
		<div class="text-center">
			<h3 class="text-lg font-semibold text-neutral-300">No Images to Import</h3>
			<p class="mt-1 text-neutral-400">Drop image files into your configured import directory.</p>
		</div>
	</div>
{/snippet}

<div class="fixed bottom-4 left-1/2 z-10 flex -translate-x-1/2 gap-2 rounded-full bg-neutral-800 p-2 shadow-2xl">
	{#if selectedIds.size < data.items.length}
		<button onclick={selectAll} class="rounded-full p-2 px-4 text-sm transition-colors hover:bg-neutral-700"> Select All </button>
	{/if}
	{#if selectedIds.size > 0}
		<button
			class="rounded-full bg-blue-600 p-2 px-6 text-sm font-semibold transition-colors hover:bg-blue-500"
			onclick={() => (showModal = true)}
			disabled={selectedIds.size === 0}
		>
			Import {selectedIds.size} image{selectedIds.size > 1 ? 's' : ''}...
		</button>
	{/if}
	{#if selectedIds.size !== 0}
		<button onclick={clearSelection} class="rounded-full p-2 px-4 text-sm transition-colors hover:bg-neutral-700"> Clear </button>
	{/if}
</div>

{#if showModal}
	<Modal onClose={() => (showModal = false)} class="!max-w-md">
		<div class="border-b border-neutral-700 p-4">
			<h1 class="text-lg font-medium text-neutral-200">Import Images</h1>
			<p class="text-sm text-neutral-400">Import {selectedIds.size} images into a session.</p>
		</div>
		<form onsubmit={importImages} class="flex flex-col gap-6 p-4">
			<SegmentedControl
				bind:value={importMode}
				options={[
					{ label: 'New Session', value: 'new' },
					{ label: 'Existing Session', value: 'existing' }
				]}
			/>

			{#if importMode === 'new'}
				<div transition:slide|local>
					<label for="session-name" class="mb-1 block text-sm font-medium text-neutral-300">Name</label>
					<input
						id="session-name"
						type="text"
						bind:value={sessionName}
						class="w-full rounded-md border-neutral-400 bg-neutral-900 p-2.5 text-neutral-200 focus:ring-blue-500 border-1"
						required
					/>
				</div>
			{:else}
				<div transition:slide|local>
					<label for="session-select" class="mb-1 block text-sm font-medium text-neutral-300">Session</label>
					<SessionPicker sessions={data.sessions} bind:value={selectedSessionId} />
				</div>
			{/if}

			<div class="flex justify-end gap-2 pt-2">
				<button type="button" onclick={() => (showModal = false)} class="rounded-md px-4 py-2 text-sm font-medium text-neutral-300 transition-colors hover:bg-neutral-800"
					>Cancel</button
				>
				<button class="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-500" type="submit" disabled={isCreating}>
					{#if isCreating}
						Importing...
					{:else}
						Import
					{/if}
				</button>
			</div>
		</form>
	</Modal>
{/if}

<div class="p-4" ontouchend={handleTouchEnd}>
	{#if data.items.length === 0}
		{@render empty()}
	{:else}
		{#each groupedByDate as group}
			<div class="col-span-full mt-4 mb-2 flex items-center gap-4">
				<h2 class="text-xl font-semibold text-neutral-200">{group.date}</h2>
				<button
					onclick={() => toggleDateSelection(group.images)}
					class="rounded-full bg-neutral-800 px-3 py-1 text-xs font-medium text-neutral-300 transition-colors hover:bg-neutral-700"
				>
					Toggle Selection
				</button>
			</div>
			<div class="image-grid">
				{#each group.images as item}
					{@const itemIndex = data.items.indexOf(item)}
					<button
						data-id={item.id}
						data-index={itemIndex}
						class="relative aspect-3/2 w-[160px] cursor-pointer overflow-hidden rounded-lg bg-neutral-900 shadow-md transition-all select-none"
						class:ring-2={selectedIds.has(item.id)}
						class:ring-blue-500={selectedIds.has(item.id)}
						onclick={(e) => handleClick(item.id, itemIndex, e)}
						ontouchstart={(e) => handleTouchStart(e, item.id, itemIndex)}
						ontouchmove={handleTouchMove}
					>
						<img
							src={`/api/imports/${item.id}/preview`}
							alt=""
							loading="lazy"
							draggable="false"
							ondragstart={(e) => e.preventDefault()}
							class="pointer-events-none h-full w-full object-cover transition-transform duration-300"
							class:scale-105={!selectedIds.has(item.id)}
						/>
						<div class="pointer-events-none absolute right-0 bottom-0 left-0 bg-black/50 p-2 text-center text-xs font-medium text-white backdrop-blur-sm">
							{formatTime(item.date)}
						</div>
						{#if selectedIds.has(item.id)}
							<div class="pointer-events-none absolute inset-0 flex items-center justify-center bg-blue-500/10 opacity-40 transition-opacity">
								<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="h-12 w-12 text-white">
									<path
										fill-rule="evenodd"
										d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12zm13.36-1.814a.75.75 0 10-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 00-1.06 1.06l2.25 2.25a.75.75 0 001.14-.094l3.75-5.25z"
										clip-rule="evenodd"
									/>
								</svg>
							</div>
						{/if}
					</button>
				{/each}
			</div>
		{/each}
	{/if}
</div>

<style>
	.aspect-3\/2 {
		aspect-ratio: 3 / 2;
	}

	.image-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, 170px);
		gap: 0.25rem;
	}

	.contents {
		display: contents;
	}
</style>
