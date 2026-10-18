<script lang="ts">
	import { page } from '$app/state';
	import { goto, invalidateAll } from '$app/navigation';
	import { tick } from 'svelte';
	import { edits } from '$lib/state/editing.svelte';
	import BasePP3 from '$lib/assets/client.pp3?raw';
	import { parsePP3Document } from '$lib/pp3-document';
	import { restoreGroupedSettings } from '$lib/adjustment-groups';
	import { resetEditorTool } from '$lib/editor-reset';
	import { IconArchive, IconRestore, IconFilter, IconCheck } from './icons';
	import IconDots from '@tabler/icons-svelte/icons/dots';
	import { editorFilterQuery, filterSummary, isFiltered, matchingTask, passProgress, readEditorFilters } from '$lib/editor-filters';
	import IconCopy from '@tabler/icons-svelte/icons/copy';
	import IconX from '@tabler/icons-svelte/icons/x';
	let {
		busy = $bindable(false),
		onnavigate,
		onclose,
		onfilter
	}: { busy?: boolean; onnavigate: (id: number) => Promise<void>; onclose: () => void; onfilter: () => void } = $props();
	const activeFilters = $derived(readEditorFilters(page.url.searchParams));
	const filtered = $derived(isFiltered(activeFilters));
	const images: { id: number; name: string; version: number; isArchived: boolean }[] = $derived(page.data.navigationImages ?? []);
	const progress = $derived(
		activeFilters.show === 'todo'
			? passProgress(
					images.map((image) => image.id),
					page.data.finishedImageIds ?? [],
					Number(page.params.img),
					edits.hasSavedVersion
				)
			: undefined
	);
	/** Restarting drops the photos finished so far by pinning the pass to now. */
	function restartPass() {
		const url = new URL(page.url);
		for (const key of ['show', 'since', 'archived', 'imported']) url.searchParams.delete(key);
		for (const [key, value] of new URLSearchParams(editorFilterQuery({ ...activeFilters, since: new Date().toISOString() }).slice(1))) url.searchParams.set(key, value);
		void goto(url);
	}
	const count = $derived(`${images.length} photo${images.length === 1 ? '' : 's'}`);
	const task = $derived(matchingTask(activeFilters));
	const status = $derived(
		progress ? (progress.remaining ? `${progress.remaining} of ${images.length} left` : 'All edited') : filtered && !task ? `${filterSummary(activeFilters)} · ${count}` : count
	);
	const heading = $derived(task && filtered ? task.label : 'Photos');
	const done = $derived(progress && images.length ? progress.finished.size / images.length : 0);
	let selected = $state<number>();
	const active = $derived(images.find((image) => image.id === selected));
	let message = $state('');
	let error = $state('');
	let strip = $state<HTMLDivElement>();
	function revealCurrent() {
		strip?.querySelector('[aria-current="true"]')?.scrollIntoView({ block: 'center', inline: 'nearest' });
	}
	$effect(() => {
		const id = page.params.img;
		selected = undefined;
		void tick().then(() => {
			if (id === page.params.img) revealCurrent();
		});
	});
	async function applySettings() {
		if (!active || busy || String(active.id) === edits.currentImageId || !edits.currentImageId || page.data.editorError) return;
		const image = active;
		const targetId = edits.currentImageId;
		busy = true;
		error = '';
		message = '';
		try {
			let pp3: string;
			if (String(image.id) === edits.currentImageId) pp3 = edits.serialize();
			else {
				const [snapshotsResponse, detailsResponse] = await Promise.all([fetch(`/api/images/${image.id}/snapshots`), fetch(`/api/images/${image.id}/details`)]);
				if (!snapshotsResponse.ok || !detailsResponse.ok) throw new Error('Could not load photo settings.');
				const snapshots: { id: number; pp3: string }[] = await snapshotsResponse.json();
				const details = await detailsResponse.json();
				pp3 = snapshots.sort((a, b) => b.id - a.id)[0]?.pp3 ?? details.importBaseline ?? BasePP3;
			}
			if (edits.currentImageId !== targetId) return;
			const document = parsePP3Document(pp3);
			const settings = resetEditorTool($state.snapshot(edits.pp3), restoreGroupedSettings(document), 'adjustments', {});
			edits.reset(settings, page.data.image, document.ui?.disabledGroups ?? [], document.ui?.editStrength ?? 100);
			message = 'Settings applied. Undo to revert.';
		} catch (cause) {
			error = cause instanceof Error ? cause.message : String(cause);
		} finally {
			busy = false;
			selected = undefined;
		}
	}
	async function archive() {
		if (!active || busy) return;
		const image = active;
		busy = true;
		error = '';
		message = '';
		try {
			if (String(image.id) === edits.currentImageId) await edits.snapshot();
			const response = await fetch(`/api/images/${image.id}/archive`, { method: image.isArchived ? 'DELETE' : 'POST' });
			if (!response.ok) throw new Error('Could not update archive status.');
			await invalidateAll();
			message = image.isArchived ? 'Photo restored.' : 'Photo archived.';
		} catch (cause) {
			error = cause instanceof Error ? cause.message : String(cause);
		} finally {
			busy = false;
			selected = undefined;
		}
	}
</script>

<svelte:window
	onpointerdown={(event) => {
		if (!(event.target as Element).closest('.photo-actions')) selected = undefined;
	}}
/>
<section id="editor-photo-browser" aria-label="Session photo browser" class="browser">
	<header>
		<div class="heading">
			<h2>{heading}</h2>
			<p class="subtitle">{status}</p>
		</div>
		<div class="header-actions">
			{#if progress && progress.finished.size}<button class="text-action" disabled={busy} onclick={restartPass} title="Hide edited photos">Restart</button>{/if}<button
				class="icon"
				class:filter-active={filtered}
				aria-label={filtered ? 'Filter photos (active)' : 'Filter photos'}
				aria-pressed={filtered}
				disabled={busy}
				onclick={onfilter}><IconFilter size={18} /></button
			><button class="icon" aria-label="Close photo browser" onclick={onclose}><IconX size={18} /></button>
		</div>
		{#if progress}<i class="progress" aria-hidden="true"><i style:width={`${done * 100}%`}></i></i>{/if}
	</header>
	{#if images.length}
		<div bind:this={strip} class="filmstrip" aria-label="Photos">
			{#each images as image, index (image.id)}
				<div class="photo" class:current={image.id === Number(page.params.img)} class:selected={image.id === selected}>
					<button
						class="thumbnail"
						disabled={busy}
						aria-label={`Open ${image.name}${image.id === Number(page.params.img) ? ', current photo' : ''}${progress?.finished.has(image.id) ? ', edited' : ''}`}
						aria-current={image.id === Number(page.params.img) ? 'true' : undefined}
						onclick={() => onnavigate(image.id)}
					>
						<img src={`/api/images/${image.id}/preview?version=${image.version}`} alt="" loading="lazy" draggable="false" />
						<span class="photo-number" aria-hidden="true">{index + 1}</span>
						{#if image.id === Number(page.params.img)}<span class="badge"
								>{#if progress?.finished.has(image.id)}<IconCheck size={12} stroke={2.5} aria-label="Edited" />{/if}Editing</span
							>{:else if progress?.finished.has(image.id)}<span class="finished" title="Edited"><IconCheck size={13} stroke={2.5} aria-hidden="true" /></span
							>{:else if image.isArchived}<span class="badge">Archived</span>{/if}
					</button>
					<div class="photo-actions">
						<button
							class="more"
							disabled={busy}
							aria-label={`Actions for ${image.name}`}
							aria-expanded={selected === image.id}
							aria-controls={`photo-actions-${image.id}`}
							onclick={() => {
								selected = selected === image.id ? undefined : image.id;
								message = '';
								error = '';
							}}><IconDots size={20} /></button
						>
						{#if selected === image.id}
							<div id={`photo-actions-${image.id}`} class="action-menu" role="group" aria-label="Photo actions">
								<button disabled={busy || image.id === Number(page.params.img)} onclick={() => onnavigate(image.id)}>Open photo</button>
								<button disabled={busy || image.id === Number(page.params.img) || !!page.data.editorError || !edits.currentImageId} onclick={applySettings}
									><IconCopy size={16} />Apply settings</button
								>
								<button disabled={busy} onclick={archive}
									>{#if image.isArchived}<IconRestore size={16} />Restore{:else}<IconArchive size={16} />Archive{/if}</button
								>
							</div>
						{/if}
					</div>
				</div>
			{/each}
		</div>
	{:else}<p class="empty">No photos match these filters. Change the gallery filter to browse more photos.</p>{/if}
	{#if message}<p class="notice" role="status">{message}</p>{/if}
	{#if error}<p class="notice" role="alert">{error}</p>{/if}
</section>

<style>
	.browser {
		position: absolute;
		right: 8px;
		bottom: 0;
		z-index: 2;
		width: min(380px, calc(100vw - 16px));
		height: min(680px, 65dvh);
		display: flex;
		flex-direction: column;
		overflow: hidden;
		border: 1px solid #525252;
		border-radius: 12px;
		background: #111;
		color: #e5e5e5;
		box-shadow: 0 16px 60px #000b;
	}
	header {
		position: relative;
		display: flex;
		flex-shrink: 0;
		justify-content: space-between;
		align-items: center;
		gap: 8px;
		padding: 6px 8px 6px 16px;
		border-bottom: 1px solid #262626;
	}
	.progress {
		position: absolute;
		left: 0;
		right: 0;
		bottom: -1px;
		height: 2px;
		background: #262626;
	}
	.progress > i {
		display: block;
		height: 100%;
		background: #d4d4d4;
		transition: width 300ms ease-out;
	}
	h2 {
		font-size: 14px;
		font-weight: 600;
	}
	.heading {
		min-width: 0;
	}
	.subtitle {
		overflow: hidden;
		color: #a3a3a3;
		font-size: 12px;
		font-variant-numeric: tabular-nums;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.header-actions {
		display: flex;
		flex-shrink: 0;
		align-items: center;
		gap: 2px;
	}
	.filter-active {
		color: var(--color-accent-soft);
	}
	.text-action {
		color: #d4d4d4;
	}
	.filmstrip {
		display: flex;
		flex-direction: column;
		flex: 1;
		min-height: 0;
		gap: 12px;
		overflow-y: auto;
		padding: 12px;
		overscroll-behavior: contain;
		scrollbar-width: thin;
		scrollbar-color: #737373 #111;
		scroll-snap-type: y proximity;
		scroll-padding-block: 12px;
	}
	.photo {
		position: relative;
		width: 100%;
		flex-shrink: 0;
		border-radius: 8px;
		background: #171717;
		outline: 1px solid #262626;
		transition: outline-color 150ms;
		scroll-snap-align: start;
	}
	.photo:hover {
		outline-color: #525252;
	}
	.photo.current {
		outline: 2px solid #e5e5e5;
	}
	.photo.selected {
		outline-color: #a3a3a3;
	}
	.thumbnail {
		position: relative;
		display: block;
		width: 100%;
		aspect-ratio: 3 / 2;
		background: #080808;
		padding: 0;
		border-radius: 5px;
		overflow: hidden;
	}
	img {
		width: 100%;
		height: 100%;
		object-fit: contain;
	}
	.badge {
		position: absolute;
		left: 8px;
		bottom: 8px;
		display: flex;
		align-items: center;
		gap: 4px;
		background: #000a;
		padding: 3px 8px;
		border-radius: 999px;
		color: #e5e5e5;
		font-size: 11px;
	}
	.finished {
		position: absolute;
		left: 8px;
		bottom: 8px;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 22px;
		height: 22px;
		border-radius: 50%;
		background: #000a;
		color: #e5e5e5;
	}
	.photo:has(.finished) img {
		opacity: 0.6;
	}
	.photo-number {
		position: absolute;
		top: 8px;
		left: 10px;
		color: #fffb;
		font-size: 11px;
		font-variant-numeric: tabular-nums;
		text-shadow: 0 1px 3px #000;
	}
	button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		min-height: 44px;
		padding: 0 12px;
		border-radius: 6px;
		font-size: 12px;
		white-space: nowrap;
	}
	button:hover:not(:disabled) {
		background: #333;
	}
	button:disabled {
		opacity: 0.35;
	}
	button:focus-visible {
		outline: 2px solid white;
		outline-offset: -3px;
	}
	.icon,
	.more {
		min-width: 44px;
	}
	.more {
		background: #000a;
	}
	@media (hover: hover) {
		.more:not([aria-expanded='true']) {
			opacity: 0;
		}
		.photo:hover .more,
		.more:focus-visible {
			opacity: 1;
		}
	}
	.more[aria-expanded='true'] {
		background: #fafafa;
		color: #111;
	}
	.photo-actions {
		position: absolute;
		top: 8px;
		right: 8px;
	}
	.action-menu {
		position: absolute;
		right: 0;
		top: 48px;
		width: 176px;
		padding: 4px;
		background: #171717;
		border: 1px solid #737373;
		border-radius: 8px;
		box-shadow: 0 6px 24px #000a;
		z-index: 2;
	}
	.action-menu button {
		width: 100%;
		justify-content: flex-start;
	}
	.notice,
	.empty {
		flex-shrink: 0;
		padding: 8px 14px;
		font-size: 12px;
		border-top: 1px solid #303030;
	}
	@media (min-width: 1024px) {
		.browser {
			width: min(760px, calc(100vw - 32px));
			height: min(580px, calc(100dvh - 88px));
			bottom: 0;
			z-index: 2;
		}
		.filmstrip {
			display: grid;
			grid-template-columns: repeat(2, minmax(0, 1fr));
			align-content: start;
			gap: 12px;
		}
		.photo:hover {
			box-shadow: 0 8px 24px #0009;
		}
	}
	@media (prefers-reduced-motion: no-preference) {
		.browser {
			animation: browser-reveal 180ms ease-out;
		}
		.action-menu {
			animation: menu-reveal 130ms ease-out;
			transform-origin: top right;
		}
		img {
			transition: transform 220ms ease-out;
		}
		@media (hover: hover) {
			.thumbnail:hover img {
				transform: scale(1.025);
			}
		}
	}
	@keyframes menu-reveal {
		from {
			opacity: 0;
			transform: translateY(-4px) scale(0.97);
		}
		to {
			opacity: 1;
			transform: translateY(0) scale(1);
		}
	}
	@keyframes browser-reveal {
		from {
			opacity: 0;
			transform: translateY(8px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}
	@media (max-width: 639px) {
		.browser {
			width: calc(100vw - 16px);
		}
	}
</style>
