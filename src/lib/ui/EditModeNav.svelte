<script lang="ts">
	import { editorFilterQuery, readEditorFilters } from '$lib/editor-filters';
	import { parsePP3Document } from '$lib/pp3-document';
	import { restoreGroupedSettings } from '$lib/adjustment-groups';
	import { browser } from '$app/environment';
	import { page } from '$app/state';
	import { parsePP3 } from '$lib/pp3-utils';
	import { IconArrowBackUp, IconArrowForwardUp, IconGitBranch, IconCheck, IconClipboard, IconCopy, IconFlag, IconHistory } from '$lib/ui/icons';
	import { IconFlagFilled } from '@tabler/icons-svelte';
	import IconDots from '@tabler/icons-svelte/icons/dots';
	import EditorToolIcon from './EditorToolIcon.svelte';
	import { editorToolUrl } from '$lib/editor-tools';
	import FlagModal from './FlagModal.svelte';
	import Tooltip from './Tooltip.svelte';
	import { edits } from '$lib/state/editing.svelte';
	import { beforeNavigate } from '$app/navigation';
	import { onDestroy } from 'svelte';
	import Modal from './Modal.svelte';
	import type { PP3 } from '$lib/pp3-utils';
	import { readSpotRemoval } from '$lib/spot-removal';

	interface Props {
		img: string;
		showSnapshots?: boolean;
		showCrop?: boolean;
		showMasks?: boolean;
		showRetouch?: boolean;
		horizontal?: boolean;
		showHistory?: boolean;
		showUndoRedo?: boolean;
		// showReset?: boolean;
		showEdit?: boolean;
		showClipboard?: boolean;
		showFlag?: boolean;
		showLast?: boolean;
		showFilter?: boolean;
		isFlagged?: boolean;
	}

	let {
		img,
		showSnapshots,
		showCrop,
		showMasks = true,
		showRetouch = true,
		horizontal = false,
		showHistory = false,
		showUndoRedo = true,
		showEdit,
		showClipboard,
		showFlag,
		isFlagged,
		showLast
	}: Props = $props();

	let showMore = $state(false);
	let toolbar = $state<HTMLElement>();
	let moreContainer = $state<HTMLDivElement>();
	let moreButton = $state<HTMLButtonElement>();
	let isDesktop = $state(false);
	const moreId = $props.id();
	const compact = $derived(showHistory && (!isDesktop || horizontal));
	const canLoadLast = $derived(showLast && edits.lastSavedPP3 && edits.hasChanges);

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
	let choiceKind = $state<'crop' | 'retouch'>('crop');
	let pendingPaste:
		| { pp3: PP3; imageId: string; version: number; groups: string[]; editStrength: number; choices: ('crop' | 'retouch')[]; includeCrop: boolean; includeRetouch: boolean }
		| undefined;
	const cropPreferenceKey = 'giraf_paste_crop';
	function cancelPaste() {
		pasteVersion += 1;
		pendingPaste = undefined;
		showCropChoice = false;
	}
	beforeNavigate(cancelPaste);
	onDestroy(cancelPaste);

	function applyPaste(pp3: PP3, includeCrop: boolean, groups: string[] = [], editStrength = 100, includeRetouch = true) {
		if (!includeCrop) {
			if (edits.pp3.Crop) pp3.Crop = structuredClone($state.snapshot(edits.pp3.Crop));
			else delete pp3.Crop;
		}
		if (!includeRetouch) {
			if (edits.pp3.Spot_removal) pp3.Spot_removal = structuredClone($state.snapshot(edits.pp3.Spot_removal));
			else delete pp3.Spot_removal;
		}
		edits.reset(pp3, page.data.image, groups, editStrength);
		pastedConfig = true;
		setTimeout(() => (pastedConfig = false), 2000);
	}

	function preferenceKey(kind: 'crop' | 'retouch') {
		return kind === 'crop' ? cropPreferenceKey : 'giraf_paste_retouch';
	}
	function readPreference(kind: 'crop' | 'retouch'): boolean | undefined {
		try {
			const key = preferenceKey(kind);
			const raw = localStorage.getItem(key);
			if (!raw) return;
			const value = JSON.parse(raw);
			if (typeof value.include === 'boolean' && Number.isFinite(value.expiresAt) && value.expiresAt > Date.now() && value.expiresAt <= Date.now() + 3600000) return value.include;
			localStorage.removeItem(key);
		} catch {
			/* Expired or legacy decisions ask again. */
		}
	}
	function nextPasteChoice() {
		if (!pendingPaste || pendingPaste.version !== pasteVersion || pendingPaste.imageId !== edits.currentImageId) return cancelPaste();
		while (pendingPaste.choices.length) {
			const kind = pendingPaste.choices.shift()!;
			const preference = readPreference(kind);
			if (preference === undefined) {
				choiceKind = kind;
				rememberCropChoice = false;
				showCropChoice = true;
				return;
			}
			if (kind === 'crop') pendingPaste.includeCrop = preference;
			else pendingPaste.includeRetouch = preference;
		}
		applyPaste(pendingPaste.pp3, pendingPaste.includeCrop, pendingPaste.groups, pendingPaste.editStrength, pendingPaste.includeRetouch);
		pendingPaste = undefined;
		showCropChoice = false;
	}
	function chooseCrop(include: boolean) {
		try {
			if (rememberCropChoice) localStorage.setItem(preferenceKey(choiceKind), JSON.stringify({ include, expiresAt: Date.now() + 3600000 }));
			else localStorage.removeItem(preferenceKey(choiceKind));
		} catch {
			/* Device storage may be unavailable. */
		}
		if (pendingPaste && pendingPaste.version === pasteVersion && pendingPaste.imageId === edits.currentImageId) {
			if (choiceKind === 'crop') pendingPaste.includeCrop = include;
			else pendingPaste.includeRetouch = include;
			nextPasteChoice();
		}
	}
	let hasClipboardContent = $state(false);

	if (browser) {
		const mediaQuery = window.matchMedia('(min-width: 1024px)');
		isDesktop = mediaQuery.matches;
		const updateDesktop = (event: MediaQueryListEvent) => {
			isDesktop = event.matches;
		};
		mediaQuery.addEventListener('change', updateDesktop);
		onDestroy(() => mediaQuery.removeEventListener('change', updateDesktop));
	}

	const tooltipPosition = $derived(horizontal ? 'bottom' : isDesktop ? 'right' : 'top');
	const iconSize = $derived(isDesktop ? 24 : 20);
	const filterQuery = $derived(editorFilterQuery(readEditorFilters(page.url.searchParams)));

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

	async function readConfigClipboard(readSystem = true): Promise<string | null> {
		if (readSystem && typeof navigator !== 'undefined' && navigator.clipboard?.readText) {
			try {
				const txt = await navigator.clipboard.readText();
				if (txt.trim()) return txt;
			} catch {
				// Device clipboard access may be unavailable; try the saved copy.
			}
		}
		try {
			const stored = localStorage.getItem('giraf_pp3_clipboard');
			return stored?.trim() ? stored : null;
		} catch {
			return null;
		}
	}

	async function checkClipboard() {
		// Background checks must not prompt for permission to read the clipboard.
		const pp3Text = await readConfigClipboard((await getClipboardPermissionState()) === 'granted');

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
		const pp3Text = await readConfigClipboard();

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
			const editStrength = document.ui?.editStrength ?? 100;
			const choices: ('crop' | 'retouch')[] = [];
			if (pp3.Crop && pp3.Crop.Enabled !== false && Number(pp3.Crop.W) > 0 && Number(pp3.Crop.H) > 0) choices.push('crop');
			if (readSpotRemoval(pp3).entries.length) choices.push('retouch');
			pendingPaste = { pp3, imageId, version, groups, editStrength, choices, includeCrop: true, includeRetouch: true };
			nextPasteChoice();
		} catch {
			pastedConfig = false;
		}
	}

	function handleKeyUp(event: KeyboardEvent) {
		// Desktop and mobile toolbars are mounted together. Only the visible
		// instance owns shortcuts; a hidden modal would block the visible one.
		if (!showClipboard || !toolbar?.getClientRects().length || event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
		if (document.querySelector('dialog:modal')) return;
		if (event.target instanceof Element && event.target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])')) return;
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
			<h2 class="text-lg font-semibold">{choiceKind === 'crop' ? 'Crop' : 'Retouch spots'} when pasting settings</h2>
			<p class="mt-2 text-sm text-neutral-300">
				{choiceKind === 'crop'
					? 'Apply the crop from the copied settings, or keep this image’s current crop?'
					: 'Apply the retouch spots from the copied settings, or keep this image’s current retouch spots?'}
			</p>
			<label class="mt-4 flex items-center gap-2 text-sm">
				<input type="checkbox" bind:checked={rememberCropChoice} class="accent-accent" /> Remember this choice for 1 hour
			</label>
			<div class="mt-6 flex flex-wrap gap-3">
				<button class="min-h-11 rounded-lg border border-neutral-400 px-4 py-2" onclick={() => chooseCrop(false)}>Keep current {choiceKind === 'crop' ? 'crop' : 'spots'}</button>
				<button class="min-h-11 rounded-lg bg-white px-4 py-2 text-black" onclick={() => chooseCrop(true)}>Apply copied {choiceKind === 'crop' ? 'crop' : 'spots'}</button>
			</div>
		</div>
	</Modal>
{/if}

<svelte:window onfocus={() => checkClipboard()} onkeyup={handleKeyUp} onpointerdown={handleOutsidePointer} onkeydown={handleMoreKeydown} />

<nav bind:this={toolbar} class="floating-pill {horizontal ? 'flex-row' : 'flex-row lg:flex-col'}">
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
	{#if showMasks && (showCrop || showEdit)}
		<Tooltip text="Masks" position={tooltipPosition}
			><a
				href={editorToolUrl(img, 'masks', filterQuery)}
				aria-label="Masks"
				class="flex h-10 w-10 items-center justify-center rounded-full text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100 lg:h-12 lg:w-12"
				><EditorToolIcon tool="masks" size={iconSize} /></a
			></Tooltip
		>
	{/if}
	{#if showRetouch && (showCrop || showEdit)}
		<Tooltip text="Retouch" position={tooltipPosition}
			><a
				href={editorToolUrl(img, 'retouch', filterQuery)}
				aria-label="Retouch"
				class="flex h-10 w-10 items-center justify-center rounded-full text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100 lg:h-12 lg:w-12"
				><EditorToolIcon tool="retouch" size={iconSize} /></a
			></Tooltip
		>
	{/if}
	{#if showCrop}
		<Tooltip text="Crop & Rotate" position={tooltipPosition}>
			<a
				href={editorToolUrl(img, 'crop', filterQuery)}
				aria-label="Crop"
				class:min-h-11={compact}
				class:min-w-11={compact}
				class="flex h-10 w-10 items-center justify-center rounded-full text-neutral-400 transition-all hover:bg-neutral-800 hover:text-neutral-100 active:scale-90 lg:h-12 lg:w-12"
			>
				<EditorToolIcon tool="crop" size={iconSize} />
			</a>
		</Tooltip>
	{/if}
	{#if showEdit}
		<Tooltip text="Adjustments" position={tooltipPosition}>
			<a
				href={editorToolUrl(img, 'adjustments', filterQuery)}
				aria-label="Edit"
				class:min-h-11={compact}
				class:min-w-11={compact}
				class="flex h-10 w-10 items-center justify-center rounded-full text-neutral-400 transition-all hover:bg-neutral-800 hover:text-neutral-100 active:scale-90 lg:h-12 lg:w-12"
			>
				<EditorToolIcon tool="adjustments" size={iconSize} />
			</a>
		</Tooltip>
	{/if}

	{#if compact}
		{#if showUndoRedo}
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
		{/if}
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
					<div
						id={moreId}
						role="group"
						aria-label="More editing actions"
						class="more-menu absolute right-0 {horizontal
							? 'top-full mt-2'
							: 'bottom-full mb-2'} z-50 max-h-[60dvh] w-64 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-xl border border-neutral-800 bg-neutral-950 p-1 text-sm text-neutral-200 shadow-2xl"
					>
						{#if showFlag}
							<button
								type="button"
								class="more-action"
								onclick={() => {
									closeMore(true);
									showFlagModal = true;
								}}
							>
								{#if isFlagged}<IconFlagFilled size={20} />{:else}<IconFlag size={20} />{/if}
								{isFlagged ? 'Remove flag' : 'Flag as favorite'}
							</button>
						{/if}
						{#if canLoadLast}
							<button
								type="button"
								class="more-action"
								onclick={() => {
									closeMore(true);
									edits.reset(edits.lastSavedDocument, page.data.image);
								}}
							>
								<IconHistory size={20} /> Load last saved version
							</button>
						{/if}
						{#if showSnapshots}
							<a href="?snapshot" class="more-action" onclick={() => closeMore(true)}><IconGitBranch size={20} /> Snapshots</a>
						{/if}
						{#if showClipboard}
							<button
								type="button"
								class="more-action"
								onclick={() => {
									closeMore(true);
									void copyConfig();
								}}
							>
								<IconCopy size={20} />
								{copiedConfig ? 'Copied!' : 'Copy edit config'}
							</button>
							{#if hasClipboardContent}
								<button
									type="button"
									class="more-action"
									onclick={() => {
										closeMore(true);
										void pasteConfig();
									}}
								>
									<IconClipboard size={20} />
									{pastedConfig ? 'Pasted!' : 'Paste edit config'}
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
			<Tooltip text={isFlagged ? 'Remove Flag' : 'Flag as Favorite'} position={tooltipPosition}>
				<button
					class="flex h-10 w-10 items-center justify-center rounded-full transition-all hover:bg-neutral-800 active:scale-90 lg:h-12 lg:w-12"
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
		{#if canLoadLast}
			<Tooltip text="Load Last Saved Version" position={tooltipPosition}>
				<button
					class="flex h-10 w-10 items-center justify-center rounded-full text-neutral-400 transition-all hover:bg-neutral-800 hover:text-neutral-100 active:scale-90 lg:h-12 lg:w-12"
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
					class="flex h-10 w-10 items-center justify-center rounded-full text-neutral-400 transition-all hover:bg-neutral-800 hover:text-neutral-100 active:scale-90 lg:h-12 lg:w-12"
				>
					<IconGitBranch size={iconSize} />
				</a>
			</Tooltip>
		{/if}

		<!-- Copy / Paste config buttons -->
		{#if showClipboard}
			<Tooltip text={copiedConfig ? 'Copied!' : 'Copy Edit Config'} position={tooltipPosition}>
				<button
					onclick={copyConfig}
					aria-label="Copy edit config"
					class="flex h-10 w-10 items-center justify-center rounded-full transition-all hover:bg-neutral-800 active:scale-90 lg:h-12 lg:w-12"
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
				<Tooltip text={pastedConfig ? 'Pasted!' : 'Paste Edit Config'} position={tooltipPosition}>
					<button
						onclick={pasteConfig}
						aria-label="Paste edit config"
						class="flex h-10 w-10 items-center justify-center rounded-full transition-all hover:bg-neutral-800 active:scale-90 lg:h-12 lg:w-12"
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
	@media (max-width: 1023px) {
		nav button[aria-label='Undo']:not(:disabled),
		nav button[aria-label='Redo']:not(:disabled) {
			color: #f5f5f5;
			background: #ffffff1a;
		}
		:global(.mobile-photo-toolbar) nav {
			gap: 0;
			padding: 2px;
		}
		:global(.mobile-photo-toolbar) nav :global(button:not(.more-action)),
		:global(.mobile-photo-toolbar) nav :global(a:not(.more-action)) {
			height: 44px;
			width: 44px;
			min-height: 44px;
			min-width: 44px;
		}
		:global(.mobile-photo-toolbar) .more-menu {
			left: 50%;
			right: auto;
			transform: translateX(-50%);
		}
		:global(.mobile-photo-toolbar) nav :global(svg) {
			width: 17px;
			height: 17px;
		}
	}
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
