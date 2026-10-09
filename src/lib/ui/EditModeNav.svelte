<script lang="ts">
	import { parsePP3Document } from '$lib/pp3-document';
	import { restoreGroupedSettings } from '$lib/adjustment-groups';
	import { browser } from '$app/environment';
	import { page } from '$app/state';
	import { countPP3Properties, diffPP3, parsePP3, stringifyPP3 } from '$lib/pp3-utils';
	import {
		IconAdjustmentsHorizontal,
		IconArrowBackUp,
		IconArrowForwardUp,
		IconGitBranch,
		IconCheck,
		IconClipboard,
		IconCopy,
		IconCrop,
		IconFlag,
		IconHistory,
	} from '$lib/ui/icons';
	import { IconFlagFilled } from '@tabler/icons-svelte';
	import IconDots from '@tabler/icons-svelte/icons/dots';
	import IconBandage from '@tabler/icons-svelte/icons/bandage';
	import FlagModal from './FlagModal.svelte';
	import Tooltip from './Tooltip.svelte';
	import { edits } from '$lib/state/editing.svelte';
	import { beforeNavigate } from '$app/navigation';
	import { onDestroy } from 'svelte';
	import { app } from '$lib/state/app.svelte';
	import Modal from './Modal.svelte';
	import type { PP3 } from '$lib/pp3-utils';

	interface Props {
		img: string;
		showSnapshots?: boolean;
		showCrop?: boolean;
		showHistory?: boolean;
		// showUndoRedo?: boolean;
		// showReset?: boolean;
		showEdit?: boolean;
		showClipboard?: boolean;
		showFlag?: boolean;
		showLast?: boolean;
		showFilter?: boolean;
		isFlagged?: boolean;
	}

	let { img, showSnapshots, showCrop, showHistory = false, showEdit, showClipboard, showFlag, isFlagged, showLast }: Props = $props();

	let showMore = $state(false);
	let moreContainer = $state<HTMLDivElement>();
	let moreButton = $state<HTMLButtonElement>();
	let isDesktop = $state(false);
	const moreId = $props.id();
	const compact = $derived(showHistory && !isDesktop);
	const canLoadLast = $derived(showLast && edits.lastSavedPP3 && countPP3Properties(diffPP3(edits.lastSavedPP3, edits.pp3)) > 0);

	function closeMore(restoreFocus = false) {
		showMore = false;
		if (restoreFocus) moreButton?.focus();
	}

	function handleOutsidePointer(event: PointerEvent) {
		if (showMore && !moreContainer?.contains(event.target as Node)) closeMore();
	}

	function handleMoreKeydown(event: KeyboardEvent) {
		if (showMore && event.key === 'Escape') {
			event.preventDefault();
			closeMore(true);
		}
	}

	beforeNavigate(() => closeMore());
	$effect(() => {
		if (!compact) closeMore();
	});

	let showFlagModal = $state(false);
	let copiedConfig = $state(false);
	let pastedConfig = $state(false);
	let pasteVersion = 0;
	let showCropChoice = $state(false);
	let rememberCropChoice = $state(false);
	let pendingPaste: { pp3: PP3; imageId: string; version: number; groups: string[] } | undefined;
	const cropPreferenceKey = 'giraf_paste_crop';
	function cancelPaste() {
		pasteVersion += 1;
		pendingPaste = undefined;
		showCropChoice = false;
	}
	beforeNavigate(cancelPaste);
	onDestroy(cancelPaste);

	function applyPaste(pp3: PP3, includeCrop: boolean, groups: string[] = []) {
		if (!includeCrop) {
			if (edits.pp3.Crop) pp3.Crop = structuredClone($state.snapshot(edits.pp3.Crop));
			else delete pp3.Crop;
		}
		edits.reset(pp3, page.data.image, groups);
		pastedConfig = true;
		setTimeout(() => (pastedConfig = false), 2000);
	}

	function chooseCrop(includeCrop: boolean) {
		try {
			if (rememberCropChoice) localStorage.setItem(cropPreferenceKey, includeCrop ? 'include' : 'exclude');
			else localStorage.removeItem(cropPreferenceKey);
		} catch { /* Device storage may be unavailable. */ }
		if (pendingPaste && pendingPaste.version === pasteVersion && pendingPaste.imageId === edits.currentImageId) {
			applyPaste(pendingPaste.pp3, includeCrop, pendingPaste.groups);
		}
		pendingPaste = undefined;
		showCropChoice = false;
	}
	let hasClipboardContent = $state(false);

	if (browser) {
		const mediaQuery = window.matchMedia('(min-width: 1024px)');
		isDesktop = mediaQuery.matches;
		mediaQuery.addEventListener('change', (e) => (isDesktop = e.matches));
	}

	const tooltipPosition = $derived(isDesktop ? 'right' : 'top');
	const iconSize = $derived(isDesktop ? 24 : 20);
	const filterQuery = $derived.by(() => {
		const filter = page.url.searchParams.get('filter');
		return filter === null ? '' : `?${new URLSearchParams({ filter })}`;
	});

	const keyMap = $derived(
		new Map<string, () => void>([
			['c', () => copyConfig()],
			['v', () => pasteConfig()]
		])
	);

	async function getClipboardPermissionState() {
		if (!browser) return 'unsupported';
		if (typeof navigator === 'undefined' || !navigator.permissions) return 'unsupported';
		try {
			const status = await navigator.permissions.query({
				// @ts-expect-error - not in the spec yet
				name: 'clipboard-read'
			});
			return status.state; // 'granted' | 'denied' | 'prompt'
		} catch {
			// Browser may not support this descriptor
			return 'unsupported';
		}
	}

	async function checkClipboard() {
		let pp3Text: string | null = null;

		// TODO: if the permission is not jet set, dont request it
		const hasPermission = await getClipboardPermissionState();
		if (hasPermission !== 'granted') {
			return;
		}

		// try clipboard readText
		if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.readText) {
			try {
				const txt = await navigator.clipboard.readText();
				if (txt && txt.trim().length > 0) {
					pp3Text = txt;
				}
			} catch {
				// ignore and try localStorage
			}
		}

		// fallback to localStorage
		if (!pp3Text) {
			try {
				const stored = localStorage.getItem('giraf_pp3_clipboard');
				if (stored && stored.trim().length > 0) {
					pp3Text = stored;
				}
			} catch {
				// ignore
			}
		}

		if (pp3Text) {
			try {
				// just check if it's parsable
				parsePP3(pp3Text);
				hasClipboardContent = true;
			} catch {
				hasClipboardContent = false;
			}
		} else {
			hasClipboardContent = false;
		}
	}

	// Copy current PP3 to clipboard and localStorage as fallback
	async function copyConfig() {
		const pp3String = edits.serialize();
		let success = false;

		// try writing to clipboard first
		if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
			try {
				await navigator.clipboard.writeText(pp3String);
				success = true;
			} catch {
				// ignore, fallback to localStorage below
				success = false;
			}
		}

		// save to localStorage as fallback/persistent copy
		try {
			localStorage.setItem('giraf_pp3_clipboard', pp3String);
			success = true;
		} catch {
			// ignore localStorage errors
		}

		copiedConfig = success;
		if (success) {
			hasClipboardContent = true;
		}
		setTimeout(() => (copiedConfig = false), 2000);
	}

	// Paste PP3 from clipboard or localStorage and apply to current edits
	async function pasteConfig() {
		const imageId = edits.currentImageId;
		const version = ++pasteVersion;
		pendingPaste = undefined;
		showCropChoice = false;
		let pp3Text: string | null = null;

		// try clipboard readText
		if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.readText) {
			try {
				const txt = await navigator.clipboard.readText();
				if (txt && txt.trim().length > 0) {
					pp3Text = txt;
				}
			} catch {
				// ignore and try localStorage
			}
		}

		// fallback to localStorage
		if (!pp3Text) {
			try {
				const stored = localStorage.getItem('giraf_pp3_clipboard');
				if (stored && stored.trim().length > 0) {
					pp3Text = stored;
				}
			} catch {
				// ignore
			}
		}

		if (!pp3Text) {
			// nothing to paste
			pastedConfig = false;
			return;
		}

		// try to parse PP3 text and apply
		try {
			if (!imageId || imageId !== edits.currentImageId || version !== pasteVersion) return;
			const document = parsePP3Document(pp3Text);
			const pp3 = restoreGroupedSettings(document);
			const groups = document.ui?.disabledGroups ?? [];
			if (pp3.Crop && pp3.Crop.Enabled !== false && Number(pp3.Crop.W) > 0 && Number(pp3.Crop.H) > 0) {
				let preference: string | null = null;
				try { preference = localStorage.getItem(cropPreferenceKey); } catch { /* Ask each time. */ }
				if (preference === 'include' || preference === 'exclude') {
					applyPaste(pp3, preference === 'include', groups);
					app.addToast(preference === 'include' ? 'Settings pasted including crop.' : 'Settings pasted keeping the current crop.', 'info', {
						label: 'Edit crop preference',
						run: () => {
							if (version !== pasteVersion) return;
							rememberCropChoice = true;
							showCropChoice = true;
						}
					});
				} else {
					pendingPaste = { pp3, imageId, version, groups };
					rememberCropChoice = false;
					showCropChoice = true;
				}
			} else applyPaste(pp3, true, groups);
		} catch {
			pastedConfig = false;
		}
	}

	function handleKeyUp(event: KeyboardEvent) {
		if (event.target && (event.target as HTMLElement).tagName === 'INPUT') {
			return; // Ignore key events when focused on input fields
		}
		const action = keyMap.get(event.key);
		if (action) {
			event.preventDefault();
			action();
		}
	}
</script>

{#if showCropChoice}
	<Modal onClose={cancelPaste}>
		<div class="p-6 text-neutral-100">
			<h2 class="text-lg font-semibold">Crop when pasting settings</h2>
			<p class="mt-2 text-sm text-neutral-300">Apply the crop from the copied settings, or keep this image’s current crop?</p>
			<label class="mt-4 flex items-center gap-2 text-sm">
				<input type="checkbox" bind:checked={rememberCropChoice} class="accent-white" /> Remember this choice on this device
			</label>
			<div class="mt-6 flex flex-wrap gap-3">
				<button class="rounded-lg border border-neutral-400 px-4 py-2" onclick={() => chooseCrop(false)}>Keep current crop</button>
				<button class="rounded-lg bg-white px-4 py-2 text-black" onclick={() => chooseCrop(true)}>Apply copied crop</button>
			</div>
		</div>
	</Modal>
{/if}

<svelte:window onfocus={() => checkClipboard()} onkeyup={handleKeyUp} onpointerdown={handleOutsidePointer} onkeydown={handleMoreKeydown} />

<nav class="flex flex-row lg:flex-col items-center gap-1 rounded-full border border-neutral-800/50 bg-neutral-950/40 p-1 backdrop-blur-xl shadow-2xl">

	<!-- {#if showReset && edits.canUndo}
		<button
			class="flex h-10 w-10 items-center justify-center rounded-full text-neutral-400 transition-all hover:bg-neutral-800 hover:text-neutral-100 active:scale-90"
			onclick={() => {}}
			aria-label="Reset All"
		>
			<IconRestore size={20} />
		</button>
	{/if} -->

	<!-- navigation -->
	{#if (showCrop || showEdit) && !compact}
		<Tooltip text="Retouch" position={tooltipPosition}><a href="/editor/{img}/retouch{filterQuery}" aria-label="Retouch" class="flex h-10 w-10 lg:h-12 lg:w-12 items-center justify-center rounded-full text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100"><IconBandage size={iconSize}/></a></Tooltip>
	{/if}
	{#if showCrop}
		<Tooltip text="Crop & Rotate" position={tooltipPosition}>
			<a
				href="/editor/{img}/crop{filterQuery}"
				aria-label="Crop"
				class:min-h-11={compact}
				class:min-w-11={compact}
				class="flex h-10 w-10 lg:h-12 lg:w-12 items-center justify-center rounded-full text-neutral-400 transition-all hover:bg-neutral-800 hover:text-neutral-100 active:scale-90"
			>
				<IconCrop size={iconSize} />
			</a>
		</Tooltip>
	{/if}
	{#if showEdit}
		<Tooltip text="Adjustments" position={tooltipPosition}>
			<a
				href="/editor/{img}{filterQuery}"
				aria-label="Edit"
				class:min-h-11={compact}
				class:min-w-11={compact}
				class="flex h-10 w-10 lg:h-12 lg:w-12 items-center justify-center rounded-full text-neutral-400 transition-all hover:bg-neutral-800 hover:text-neutral-100 active:scale-90"
			>
				<IconAdjustmentsHorizontal size={iconSize} />
			</a>
		</Tooltip>
	{/if}

	{#if compact}
		<button
			type="button"
			onclick={() => edits.undo()}
			disabled={!edits.canUndo}
			aria-label="Undo"
			class="flex h-11 w-11 items-center justify-center rounded-full text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-neutral-100 disabled:pointer-events-none disabled:opacity-25"
		>
			<IconArrowBackUp size={20} />
		</button>
		<button
			type="button"
			onclick={() => edits.redo()}
			disabled={!edits.canRedo}
			aria-label="Redo"
			class="flex h-11 w-11 items-center justify-center rounded-full text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-neutral-100 disabled:pointer-events-none disabled:opacity-25"
		>
			<IconArrowForwardUp size={20} />
		</button>
		{#if showCrop || showEdit || showFlag || showSnapshots || canLoadLast || showClipboard}
			<div class="relative" bind:this={moreContainer}>
				<button
					bind:this={moreButton}
					type="button"
					aria-label="More editing actions"
					aria-expanded={showMore}
					aria-controls={moreId}
					onclick={() => (showMore = !showMore)}
					class="flex h-11 w-11 items-center justify-center rounded-full text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-neutral-100"
				>
					<IconDots size={20} />
				</button>
				{#if showMore}
					<div id={moreId} role="group" aria-label="More editing actions" class="absolute right-0 bottom-full z-50 mb-2 max-h-[60dvh] w-64 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-xl border border-neutral-800 bg-neutral-950 p-1 text-sm text-neutral-200 shadow-2xl">
						<a href="/editor/{img}/retouch{filterQuery}" class="more-action" onclick={() => closeMore()}><IconBandage size={20}/>Retouch spots</a>
						{#if showFlag}
							<button type="button" class="more-action" onclick={() => { closeMore(true); showFlagModal = true; }}>
								{#if isFlagged}<IconFlagFilled size={20} />{:else}<IconFlag size={20} />{/if}
								{isFlagged ? 'Remove flag' : 'Flag as favorite'}
								</button>
						{/if}
						{#if canLoadLast}
							<button type="button" class="more-action" onclick={() => { closeMore(true); edits.reset(edits.lastSavedDocument, page.data.image); }}>
								<IconHistory size={20} /> Load last saved version
							</button>
						{/if}
						{#if showSnapshots}
							<a href="?snapshot" class="more-action" onclick={() => closeMore(true)}><IconGitBranch size={20} /> Snapshots</a>
						{/if}
						{#if showClipboard}
							<button type="button" class="more-action" onclick={() => { closeMore(true); void copyConfig(); }}>
								<IconCopy size={20} /> {copiedConfig ? 'Copied!' : 'Copy edit config'}
							</button>
							{#if hasClipboardContent}
								<button type="button" class="more-action" onclick={() => { closeMore(true); void pasteConfig(); }}>
									<IconClipboard size={20} /> {pastedConfig ? 'Pasted!' : 'Paste edit config'}
								</button>
							{/if}
						{/if}
					</div>
				{/if}
			</div>
		{/if}
	{:else}
	<!-- flag button -->
	{#if showFlag}
		<Tooltip text={isFlagged ? "Remove Flag" : "Flag as Favorite"} position={tooltipPosition}>
			<button
				class="flex h-10 w-10 lg:h-12 lg:w-12 items-center justify-center rounded-full transition-all hover:bg-neutral-800 active:scale-90"
				class:text-neutral-100={isFlagged}
				class:text-neutral-400={!isFlagged}
				onclick={() => (showFlagModal = true)}
				aria-label="Flagged"
			>
				{#if isFlagged}
					<IconFlagFilled size={iconSize} />
				{:else}
					<IconFlag size={iconSize} />
				{/if}
			</button>
		</Tooltip>
	{/if}

	<!-- last version -->
	{#if showLast && edits.lastSavedPP3 && countPP3Properties(diffPP3(edits.lastSavedPP3, edits.pp3)) > 0}
		<Tooltip text="Load Last Saved Version" position={tooltipPosition}>
			<button
				class="flex h-10 w-10 lg:h-12 lg:w-12 items-center justify-center rounded-full text-neutral-400 transition-all hover:bg-neutral-800 hover:text-neutral-100 active:scale-90"
				onclick={() => edits.reset(edits.lastSavedDocument, page.data.image)}
				aria-label="Load Last Version"
			>
				<IconHistory size={iconSize} />
			</button>
		</Tooltip>
	{/if}

	<!-- version snapshots -->
	{#if showSnapshots}
		<Tooltip text="Snapshots" position={tooltipPosition}>
			<a
				href="?snapshot"
				aria-label="Snapshots"
				class="flex h-10 w-10 lg:h-12 lg:w-12 items-center justify-center rounded-full text-neutral-400 transition-all hover:bg-neutral-800 hover:text-neutral-100 active:scale-90"
			>
				<IconGitBranch size={iconSize} />
			</a>
		</Tooltip>
	{/if}


	<!-- Copy / Paste config buttons -->
	{#if showClipboard}
		<Tooltip text={copiedConfig ? "Copied!" : "Copy Edit Config"} position={tooltipPosition}>
			<button
				onclick={copyConfig}
				aria-label="Copy edit config"
				class="flex h-10 w-10 lg:h-12 lg:w-12 items-center justify-center rounded-full transition-all hover:bg-neutral-800 active:scale-90"
				class:text-neutral-100={copiedConfig}
				class:text-neutral-400={!copiedConfig}
			>
				{#if copiedConfig}
					<IconCheck size={iconSize} />
				{:else}
					<IconCopy size={iconSize} />
				{/if}
			</button>
		</Tooltip>
		{#if hasClipboardContent}
			<Tooltip text={pastedConfig ? "Pasted!" : "Paste Edit Config"} position={tooltipPosition}>
				<button
					onclick={pasteConfig}
					aria-label="Paste edit config"
					class="flex h-10 w-10 lg:h-12 lg:w-12 items-center justify-center rounded-full transition-all hover:bg-neutral-800 active:scale-90"
					class:text-neutral-100={pastedConfig}
					class:text-neutral-400={!pastedConfig}
				>
					{#if pastedConfig}
						<IconCheck size={iconSize} />
					{:else}
						<IconClipboard size={iconSize} />
					{/if}
				</button>
			</Tooltip>
		{/if}
	{/if}
	{/if}
</nav>

{#if showFlagModal}
	<FlagModal {img} onClose={() => (showFlagModal = false)} />
{/if}

<style>
	.more-action {
		display: flex;
		min-height: 44px;
		width: 100%;
		align-items: center;
		gap: 0.75rem;
		border-radius: 0.5rem;
		padding: 0.5rem 0.75rem;
		text-align: left;
	}

	.more-action:hover,
	.more-action:focus-visible {
		background: #262626;
		color: #f5f5f5;
	}
</style>
