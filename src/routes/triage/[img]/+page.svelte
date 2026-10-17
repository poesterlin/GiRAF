<script lang="ts">
	import { untrack } from 'svelte';
	import { beforeNavigate, goto, invalidateAll, preloadData } from '$app/navigation';
	import { page } from '$app/state';
	import { app } from '$lib/state/app.svelte';
	import { tagStore } from '$lib/state/tag.svelte';
	import { markStackReviewed, nextAfterStack, similarCandidates } from '$lib/similar-images';
	import FlagModal from '$lib/ui/FlagModal.svelte';
	import SimilarPicker from '$lib/ui/SimilarPicker.svelte';
	import Tooltip from '$lib/ui/Tooltip.svelte';
	import { IconArchive, IconChevronLeft, IconChevronRight, IconFlag, IconRestore, IconAdjustmentsFilled } from '$lib/ui/icons';
	import ImageStrip from '../ImageStrip.svelte';
	import TriagePreview from '$lib/ui/TriagePreview.svelte';

	let { data } = $props();
	const photoInfo = $derived.by(() => {
		const image = data.image;
		const exposure = image.exposure?.trim();
		const seconds = exposure ? Number(exposure) : NaN;
		const shutter = Number.isFinite(seconds) && seconds > 0
			? seconds < 1 ? `1/${Math.round(1 / seconds)} s` : `${seconds} s`
			: exposure ? /\bs\b|sec/i.test(exposure) ? exposure : `${exposure} s` : null;
		return [
			{ label: 'ISO', value: image.iso ? String(image.iso) : null },
			{ label: 'Aperture', value: image.aperture ? `f/${image.aperture}` : null },
			{ label: 'Shutter', value: shutter },
			{ label: 'Focal length', value: image.focalLength ? /mm/i.test(image.focalLength) ? image.focalLength : `${image.focalLength} mm` : null }
		].filter((item) => item.value);
	});

	let showTagModal = $state(false);

	// Similar shots (stacks) are compared on request, from the button or the C key
	const similar = $derived(similarCandidates(data.sessionImages, data.image));
	// Everything in the group, archived shots included, so a sorted group can be reopened and corrected
	const similarAll = $derived(similarCandidates(data.sessionImages, data.image, true));
	// Keyed on the whole group, archived shots included, so archiving the first shot does not change its identity
	const similarBase = $derived(similarAll.length > 1 ? similarAll[0].id : null);
	let showSimilar = $state(false);
	let resolvingSimilar = $state(false);

	// Moving on to a different group of similar shots closes the comparison.
	$effect(() => {
		similarBase;
		untrack(() => (showSimilar = false));
	});

	function finishSimilar() {
		const base = similarBase;
		const next = nextAfterStack(data.sessionImages, similar);
		showSimilar = false;
		return { base, next };
	}

	function postponeSimilar() {
		showSimilar = false;
	}

	async function setArchived(ids: number[], archive: boolean) {
		const results = await Promise.all(ids.map((id) => fetch(`/api/images/${id}/archive`, { method: archive ? 'POST' : 'DELETE' }).then((res) => (res.ok ? id : null)).catch(() => null)));
		return results.filter((id): id is number => id !== null);
	}

	async function keepAllSimilar() {
		const { base, next } = finishSimilar();
		const restored = await setArchived(similarAll.filter((image) => image.isArchived).map((image) => image.id), false);
		if (base !== null) markStackReviewed(localStorage, base);
		if (restored.length) app.addToast('Restored.', 'info', { label: 'Undo', run: () => void undoSimilar([], restored, base) });
		if (next) await goto(`/triage/${next}`, { invalidateAll: true, noScroll: true });
		else await invalidateAll();
	}

	async function keepBestSimilar(keepIds: number[]) {
		const base = similarBase;
		const discard = similarAll.filter((image) => !keepIds.includes(image.id) && !image.isArchived);
		const restore = similarAll.filter((image) => keepIds.includes(image.id) && image.isArchived);
		const next = nextAfterStack(data.sessionImages, similarAll);
		const firstIndex = data.sessionImages.findIndex((image) => image.id === similarAll[0]?.id);
		const before = firstIndex > 0 ? data.sessionImages[firstIndex - 1].id : undefined;
		resolvingSimilar = true;
		try {
			const [archived, restored] = await Promise.all([setArchived(discard.map((image) => image.id), true), setArchived(restore.map((image) => image.id), false)]);
			if (archived.length < discard.length || restored.length < restore.length) app.addToast('Some photos could not be updated.', 'error');
			if (base !== null && archived.length === discard.length) markStackReviewed(localStorage, base);
			if (archived.length || restored.length) {
				const message = !archived.length ? 'Restored.' : restored.length ? 'Updated.' : keepIds.length ? 'Extras archived.' : 'All archived.';
				app.addToast(message, 'info', { label: 'Undo', run: () => void undoSimilar(archived, restored, base) });
			}
			showSimilar = false;
			const destination = next ?? keepIds[0] ?? before;
			if (destination) await goto(`/triage/${destination}`, { invalidateAll: true, noScroll: true });
			else await invalidateAll();
		} finally {
			resolvingSimilar = false;
		}
	}

	async function undoSimilar(archived: number[], restored: number[], base: number | null) {
		const [reRestored, reArchived] = await Promise.all([setArchived(archived, false), setArchived(restored, true)]);
		if (reRestored.length < archived.length || reArchived.length < restored.length) app.addToast('Some photos could not be reverted.', 'error');
		await invalidateAll();
	}

	let isArchiving = $state(false);
	let justRestored = $state(false);
	let isRestoring = $state(false);
	let navigationVersion = 0;
	beforeNavigate(() => { navigationVersion += 1; });

	async function archiveImage() {
		if (isArchiving || isRestoring || data.image.isArchived) return;
		const imageId = data.image.id;
		const nextImage = data.nextImage;
		const version = navigationVersion;
		isArchiving = true;
		try {
			const res = await fetch(`/api/images/${imageId}/archive`, {
				method: 'POST'
			});
			if (res.ok) {
				app.addToast('Image archived.', 'info', { label: 'Undo', run: () => void undoArchive(imageId) });
				if (nextImage && navigationVersion === version && data.image.id === imageId) {
					await goto(`/triage/${nextImage}`, { invalidateAll: true, noScroll: true });
				} else {
					await invalidateAll();
				}
			} else {
				app.addToast('Failed to archive image.', 'error');
			}
		} catch (error) {
			console.error('Failed to archive image', error);
			app.addToast('Failed to archive image.', 'error');
		} finally {
			isArchiving = false;
		}
	}

	async function undoArchive(imageId: number) {
		try {
			const res = await fetch(`/api/images/${imageId}/archive`, { method: 'DELETE' });
			if (!res.ok) throw new Error(`Restore failed with ${res.status}`);
			await invalidateAll();
			// The toast outlives the page: only steer back to the photo while still in triage
			if (page.url.pathname.startsWith('/triage/') && data.image.id !== imageId) await goto(`/triage/${imageId}`, { invalidateAll: true, noScroll: true });
		} catch (error) {
			console.error('Failed to undo archive', error);
			app.addToast('Failed to restore image.', 'error');
		}
	}

	async function restoreImage() {
		if (isArchiving || isRestoring || !data.image.isArchived) return;
		const imageId = data.image.id;
		const version = navigationVersion;
		isRestoring = true;
		try {
			const res = await fetch(`/api/images/${imageId}/archive`, {
				method: 'DELETE'
			});
			if (res.ok) {
				await invalidateAll();
				if (navigationVersion === version && data.image.id === imageId) {
					justRestored = true;
					setTimeout(() => (justRestored = false), 1000);
				}
			} else {
				app.addToast('Failed to restore image.', 'error');
			}
		} catch (error) {
			console.error('Failed to restore image', error);
			app.addToast('Failed to restore image.', 'error');
		} finally {
			isRestoring = false;
		}
	}
	$effect(() => {
		tagStore.existingTags = data.tags.map((t) => t.name);
		tagStore.selected = data.imageTags.map((it) => it.name);
	});

	$effect(() => {
		const next = data.nextImage;
		const previous = data.previousImage;
		untrack(() => {
			if (next) void preloadData(`/triage/${next}`).catch(() => {});
			if (previous) void preloadData(`/triage/${previous}`).catch(() => {});
		});
	});

	const keyMap = $derived(
		new Map<string, () => void>([
			['ArrowRight', () => (data.nextImage ? goto(`/triage/${data.nextImage}`) : undefined)],
			['ArrowLeft', () => (data.previousImage ? goto(`/triage/${data.previousImage}`) : undefined)],
			['a', () => (data.image.isArchived ? restoreImage() : archiveImage())],
			['t', () => (showTagModal = true)]
		])
	);

	function handleKeyUp(event: KeyboardEvent) {
		if (showSimilar) return;
		if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
		if (event.target instanceof Element && event.target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])')) return;
		if (document.querySelector('dialog:modal')) return;
		const action = keyMap.get(event.key);
		if (action) {
			event.preventDefault();
			action();
		}
	}
</script>

<svelte:window onkeyup={handleKeyUp} />

<div class="flex h-full flex-col overflow-hidden bg-neutral-950 font-sans lg:flex-row">
	<!-- Image Strip (Left on Desktop, Bottom on Mobile) -->
	<aside class="order-2 {showSimilar ? 'max-lg:hidden' : ''} border-neutral-800 bg-neutral-950 lg:order-1 lg:w-[240px] lg:border-r border-t lg:border-t-0 flex-shrink-0">
		<div class="h-full overflow-y-auto custom-scrollbar">
			<ImageStrip images={data.sessionImages} currentImageId={data.image.id} />
		</div>
	</aside>

	<!-- Main Preview Area -->
	<main class="relative order-1 flex min-h-0 flex-1 flex-col overflow-hidden bg-neutral-900 lg:order-2">
		<div class="flex min-h-0 flex-1 items-center justify-center p-4" class:lg:pr-44={photoInfo.length > 0 || !!data.image.camera || !!data.image.lens}>
			<TriagePreview imageId={data.image.id} version={data.image.version} snapshotId={data.snapshotId} archiving={isArchiving} />
		</div>

		{#if photoInfo.length || data.image.camera || data.image.lens}
			<section aria-label="Photo information" class="z-10 mx-4 mb-3 shrink-0 rounded-2xl border border-neutral-600 bg-neutral-950/90 px-4 py-3 shadow-lg backdrop-blur-md lg:absolute lg:right-4 lg:bottom-4 lg:m-0 lg:w-36 lg:px-3">
				{#if photoInfo.length}
					<dl class="flex flex-wrap gap-x-5 gap-y-2 lg:flex-col lg:gap-y-3">
						{#each photoInfo as item (item.label)}
							<div>
								<dt class="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">{item.label}</dt>
								<dd class="mt-0.5 text-sm font-semibold text-neutral-100 tabular-nums">{item.value}</dd>
							</div>
						{/each}
					</dl>
				{/if}
				{#if data.image.camera || data.image.lens}
					<div class="mt-2 border-t border-neutral-700 pt-2 text-xs leading-relaxed text-neutral-300 break-words">
						{#if data.image.camera}<p>{data.image.camera}</p>{/if}
						{#if data.image.lens}<p class="text-neutral-400">{data.image.lens}</p>{/if}
					</div>
				{/if}
			</section>
		{/if}

		<!-- Left Side Controls -->
		<div class="absolute inset-y-0 left-4 flex flex-col justify-center gap-8 pointer-events-none sm:left-8">
			<div class="pointer-events-auto flex flex-col gap-4">
				<Tooltip text="Restore Image" position="right">
					<button
						onclick={restoreImage}
						aria-label="Restore Image"
						disabled={!data.image.isArchived || isArchiving || isRestoring}
						class="flex h-14 w-14 items-center justify-center rounded-full border border-white/10 bg-neutral-950/40 text-neutral-400 backdrop-blur-md transition-all active:scale-90 disabled:opacity-50 sm:h-16 sm:w-14 shadow-2xl"
						class:text-neutral-100={data.image.isArchived}
						class:bg-neutral-800={data.image.isArchived}
						class:hover:bg-neutral-100={data.image.isArchived}
						class:hover:text-neutral-950={data.image.isArchived}
					>
						<IconRestore size={28} />
					</button>
				</Tooltip>

				{#if data.previousImage}
					<Tooltip text="Previous Image (Left Arrow)" position="right">
						<a
							href={`/triage/${data.previousImage}`}
							class="flex h-24 w-14 items-center justify-center rounded-full border border-white/10 bg-neutral-950/40 text-neutral-400 backdrop-blur-md transition-all hover:bg-neutral-100 hover:text-neutral-950 active:scale-90 sm:w-14 shadow-2xl"
						>
							<IconChevronLeft size={32} />
						</a>
					</Tooltip>
				{/if}

				<Tooltip text="Edit Image" position="right">
					<a
						href={`/editor/${data.image.id}`}
						class="flex h-14 w-14 items-center justify-center rounded-full border border-white/10 bg-neutral-100 text-neutral-950 transition-all hover:bg-neutral-200 active:scale-90 sm:h-16 sm:w-14 shadow-2xl"
					>
						<IconAdjustmentsFilled size={28} />
					</a>
				</Tooltip>
			</div>
		</div>

		<!-- Right Side Controls -->
		<div class="absolute inset-y-0 right-4 flex flex-col justify-center gap-8 pointer-events-none sm:right-8">
			<div class="pointer-events-auto flex flex-col gap-4">
				<Tooltip text="Archive Image" position="left">
					<button
						onclick={archiveImage}
						aria-label="Archive Image"
						disabled={data.image.isArchived || isArchiving || isRestoring}
						class="flex h-14 w-14 items-center justify-center rounded-full border border-white/10 bg-neutral-950/40 text-neutral-100 backdrop-blur-md transition-all active:scale-90 disabled:opacity-10 sm:h-16 sm:w-14 shadow-2xl"
						class:hover:bg-neutral-500={!data.image.isArchived}
						class:hover:text-white={!data.image.isArchived}
					>
						<IconArchive size={28} />
					</button>
				</Tooltip>

				{#if data.nextImage}
					<Tooltip text="Next Image (Right Arrow)" position="left">
						<a
							href={`/triage/${data.nextImage}`}
							data-sveltekit-preload-data="hover"
							class="flex h-24 w-14 items-center justify-center rounded-full border border-white/10 bg-neutral-950/40 text-neutral-400 backdrop-blur-md transition-all hover:bg-neutral-100 hover:text-neutral-950 active:scale-90 sm:w-14 shadow-2xl"
						>
							<IconChevronRight size={32} />
						</a>
					</Tooltip>
				{/if}

				<Tooltip text="Tag Image (T)" position="left">
					<button
						onclick={() => (showTagModal = true)}
						class="flex h-14 w-14 items-center justify-center rounded-full border border-white/10 bg-neutral-950/40 text-neutral-400 backdrop-blur-md transition-all hover:bg-neutral-800 hover:text-neutral-100 active:scale-90 sm:h-16 sm:w-14 shadow-2xl"
					>
						<IconFlag size={28} />
					</button>
				</Tooltip>
			</div>
		</div>

		{#if similarAll.length > 1}
			<div class="absolute top-3 left-1/2 z-10 -translate-x-1/2">
			<Tooltip text="Compare similar photos (C)" position="bottom">
				<button type="button" onclick={() => (showSimilar = true)} class="min-h-11 rounded-full border border-white/10 bg-neutral-950/70 px-4 text-sm font-semibold text-neutral-100 backdrop-blur-md hover:bg-neutral-100 hover:text-neutral-950">
					{similarAll.length} similar · Compare
				</button>
			</Tooltip>
			</div>
		{/if}

		{#if showSimilar && similarAll.length > 1}
			{#key similarBase}
			<SimilarPicker images={similarAll} currentId={data.image.id} busy={resolvingSimilar} onKeep={keepBestSimilar} onKeepAll={keepAllSimilar} onLater={postponeSimilar} />
			{/key}
		{/if}
	</main>
</div>

{#if showTagModal}
	<FlagModal img={page.params.img!} onClose={() => (showTagModal = false)} />
{/if}

<style>
	.custom-scrollbar::-webkit-scrollbar {
		width: 4px;
	}
	.custom-scrollbar::-webkit-scrollbar-track {
		background: transparent;
	}
	.custom-scrollbar::-webkit-scrollbar-thumb {
		background: #262626;
		border-radius: 10px;
	}
	.custom-scrollbar::-webkit-scrollbar-thumb:hover {
		background: #404040;
	}
</style>
